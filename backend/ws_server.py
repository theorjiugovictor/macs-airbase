"""
WebSocket server — bidirectional communication hub.

Outbound (server → client):
  - history: bulk event replay on connect
  - live events: streamed as they happen (role-filtered)

Inbound (client → server):
  - AUTH: authenticate with JWT token for role-based access
  - FIELD_REPORT: submit field intelligence to the bulletin board

Runs in its own asyncio event loop in a background thread.
"""

import asyncio
import json
import threading
import logging
import time
from dataclasses import asdict

import websockets

from shared_state import bulletin
from auth import verify_token, filter_event_for_role, can_report_domain, VALID_ROLES

logger = logging.getLogger(__name__)

WS_HOST = "0.0.0.0"
WS_PORT = 8765


class ClientSession:
    """Tracks per-connection state."""
    __slots__ = ("ws", "role", "callsign", "authenticated")

    def __init__(self, ws):
        self.ws = ws
        self.role = "commander"     # default: full read access (backward compat)
        self.callsign = "ANONYMOUS"
        self.authenticated = False


# Global client registry (ws → ClientSession)
_clients: dict = {}
_clients_lock = threading.Lock()


def _register_client(ws) -> ClientSession:
    session = ClientSession(ws)
    with _clients_lock:
        _clients[ws] = session
    bulletin.register_ws_client(ws)
    return session


def _unregister_client(ws):
    with _clients_lock:
        _clients.pop(ws, None)
    bulletin.unregister_ws_client(ws)


def get_client_session(ws):
    with _clients_lock:
        return _clients.get(ws)


# ── Inbound message handlers ────────────────────────────────────────────────

async def _handle_auth(session: ClientSession, data: dict):
    """Handle AUTH message — validate JWT or accept simple role+callsign (demo mode)."""

    token = data.get("token", "")
    role_direct = data.get("role", "")
    callsign_direct = data.get("callsign", "")

    # Try JWT first
    payload = verify_token(token) if token else None

    if payload:
        session.role = payload["role"]
        session.callsign = payload.get("callsign", "UNKNOWN")
        session.authenticated = True
    elif role_direct and role_direct in VALID_ROLES:
        # Demo mode: accept simple role + callsign without JWT
        session.role = role_direct
        session.callsign = callsign_direct or f"{role_direct.upper()}-FIELD"
        session.authenticated = True
    else:
        await session.ws.send(json.dumps({
            "type": "auth_error",
            "message": "Invalid token or role",
        }))
        return

    logger.info(f"Authenticated: {session.callsign} as {session.role}")
    await session.ws.send(json.dumps({
        "type": "auth_ok",
        "role": session.role,
        "callsign": session.callsign,
    }))


async def _handle_field_report(session: ClientSession, data: dict):
    """Handle FIELD_REPORT — validate and post to bulletin board."""
    domain = data.get("domain", "").upper()
    message = data.get("message", "").strip()
    severity = data.get("severity", "MEDIUM").upper()
    location = data.get("location")
    tags = data.get("tags", [])

    # Validation
    if not message:
        await session.ws.send(json.dumps({
            "type": "report_error",
            "message": "Report message cannot be empty",
        }))
        return

    if not domain:
        await session.ws.send(json.dumps({
            "type": "report_error",
            "message": "Domain is required (FUEL, ARMING, MAINTENANCE, SORTIE, THREAT)",
        }))
        return

    if not can_report_domain(session.role, domain):
        await session.ws.send(json.dumps({
            "type": "report_error",
            "message": f"Role '{session.role}' cannot report on domain '{domain}'",
        }))
        return

    # Build payload
    payload = {
        "message": message,
        "reporter_role": session.role,
        "reporter_callsign": session.callsign,
    }
    if location:
        payload["location"] = location

    # Post to bulletin board
    event = bulletin.post(
        source=f"FIELD:{session.callsign}",
        event_type="FIELD_REPORT",
        domain=domain,
        severity=severity,
        payload=payload,
        tags=["field-report", session.role] + tags,
        source_layer="CROWD",
    )

    logger.info(f"Field report from {session.callsign}: {message[:60]}")

    await session.ws.send(json.dumps({
        "type": "report_ok",
        "event_id": event.id,
    }))


# ── Connection handler ───────────────────────────────────────────────────────

async def _handler(websocket):
    session = _register_client(websocket)
    logger.info(f"Client connected: {websocket.remote_address}")

    try:
        # Send filtered history on connect
        history = bulletin.snapshot(max_events=200)
        filtered = [e for e in history if filter_event_for_role(e, session.role)]
        await websocket.send(json.dumps({"type": "history", "events": filtered}))

        # Listen for inbound messages
        async for raw in websocket:
            try:
                data = json.loads(raw)
                msg_type = data.get("type", "")

                if msg_type == "auth":
                    await _handle_auth(session, data)
                    # Re-send filtered history after auth changes role
                    history = bulletin.snapshot(max_events=200)
                    filtered = [e for e in history if filter_event_for_role(e, session.role)]
                    await websocket.send(json.dumps({"type": "history", "events": filtered}))

                elif msg_type == "field_report":
                    await _handle_field_report(session, data)

                elif msg_type == "ping":
                    await websocket.send(json.dumps({"type": "pong", "ts": time.time()}))

                else:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": f"Unknown message type: {msg_type}",
                    }))

            except json.JSONDecodeError:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON",
                }))

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        _unregister_client(websocket)
        logger.info(f"Client disconnected: {session.callsign} ({session.role})")


# ── Role-filtered broadcast (overrides bulletin's default) ───────────────────

def _role_filtered_broadcast(event):
    """Broadcast event to all connected clients, filtered by role."""
    event_dict = asdict(event)
    msg_full = json.dumps(event_dict)

    with _clients_lock:
        sessions = list(_clients.values())

    for session in sessions:
        if not filter_event_for_role(event_dict, session.role):
            continue
        try:
            loop = bulletin._ws_loop
            if loop:
                future = asyncio.run_coroutine_threadsafe(
                    session.ws.send(msg_full), loop
                )
                future.add_done_callback(
                    lambda f, _ws=session.ws: _unregister_client(_ws)
                    if f.exception() else None
                )
        except Exception:
            _unregister_client(session.ws)


# ── Server startup ───────────────────────────────────────────────────────────

def start_ws_server():
    """Start bidirectional WebSocket server in a background thread."""
    loop = asyncio.new_event_loop()
    bulletin.set_ws_loop(loop)

    # Replace bulletin's default broadcast with role-filtered version
    bulletin._broadcast_ws = _role_filtered_broadcast

    async def _serve():
        async with websockets.serve(_handler, WS_HOST, WS_PORT):
            logger.info(f"WebSocket server on ws://{WS_HOST}:{WS_PORT} (bidirectional)")
            await asyncio.Future()  # run forever

    def _run():
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_serve())

    thread = threading.Thread(target=_run, daemon=True, name="ws-server")
    thread.start()
    return thread
