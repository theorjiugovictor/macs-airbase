"""
WebSocket server — bidirectional communication hub.

Outbound (server → client):
  - history: bulk event replay on connect
  - live events: streamed as they happen (role-filtered)

Inbound (client → server):
  - AUTH: authenticate with JWT token for role-based access
  - FIELD_REPORT: submit field intelligence to the bulletin board
  - VOICE_EVENT: submit voice commands/summaries to the bulletin board

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
from auth import verify_token, filter_event_for_role, can_report_domain, VALID_ROLES, MISSION_CONTROL_ROLES
from mission_board import mission_board

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


async def _handle_voice_event(session: ClientSession, data: dict):
    """Handle voice-originated commander and BASEOPS events."""
    speaker = data.get("speaker", "commander").strip().lower()
    message = data.get("message", "").strip()
    domain = data.get("domain", "SYSTEM").upper() or "SYSTEM"
    severity = data.get("severity", "INFO").upper()
    tags = data.get("tags", [])

    if not message:
        await session.ws.send(json.dumps({
            "type": "voice_error",
            "message": "Voice event message cannot be empty",
        }))
        return

    valid_domains = {"FUEL", "ARMING", "MAINTENANCE", "SORTIE", "THREAT", "SYSTEM"}
    if domain not in valid_domains:
        domain = "SYSTEM"

    payload = {
        "message": message,
        "field_role": session.role,
        "field_callsign": session.callsign,
        "speaker": speaker,
    }

    if speaker == "baseops":
        source = "BASEOPS_VOICE"
        event_type = "VOICE_SUMMARY"
        source_layer = "API"
        event_tags = ["voice", "voice-summary", session.role]
    else:
        source = f"VOICE:{session.callsign}"
        event_type = "VOICE_COMMAND"
        source_layer = "CROWD"
        event_tags = ["voice", "voice-command", session.role]

    event = bulletin.post(
        source=source,
        event_type=event_type,
        domain=domain,
        severity=severity,
        payload=payload,
        tags=event_tags + tags,
        source_layer=source_layer,
    )

    await session.ws.send(json.dumps({
        "type": "voice_ok",
        "event_id": event.id,
    }))


async def _handle_mission(session: ClientSession, data: dict):
    """Handle MISSION messages — create, update, cancel missions."""
    if session.role not in MISSION_CONTROL_ROLES:
        await session.ws.send(json.dumps({
            "type": "mission_error",
            "error": f"Role '{session.role}' cannot manage missions",
        }))
        return

    action = data.get("action", "")

    if action == "create":
        name = data.get("name", "").strip()
        description = data.get("description", "").strip()
        domain = data.get("domain", "SORTIE").upper()
        priority = data.get("priority", "HIGH").upper()
        duration_min = float(data.get("duration_min", 60))
        parameters = data.get("parameters", {})

        if not name:
            await session.ws.send(json.dumps({
                "type": "mission_error",
                "error": "Mission name is required",
            }))
            return

        mission = mission_board.create(
            name=name, description=description, domain=domain,
            priority=priority, duration_min=duration_min,
            created_by=session.callsign, parameters=parameters,
        )
        await session.ws.send(json.dumps({
            "type": "mission_ok",
            "action": "created",
            "mission": {"id": mission.id, "name": mission.name},
        }))

    elif action == "update":
        mission_id = data.get("mission_id", "")
        updates = {}
        for key in ("name", "description", "domain", "priority",
                     "duration_min", "parameters"):
            if key in data:
                updates[key] = data[key]

        mission = mission_board.update(mission_id, updated_by=session.callsign, **updates)
        if not mission:
            await session.ws.send(json.dumps({
                "type": "mission_error",
                "error": f"Mission '{mission_id}' not found or not active",
            }))
            return

        await session.ws.send(json.dumps({
            "type": "mission_ok",
            "action": "updated",
            "mission": {"id": mission.id, "name": mission.name},
        }))

    elif action == "cancel":
        mission_id = data.get("mission_id", "")
        reason = data.get("reason", "")

        mission = mission_board.cancel(mission_id, cancelled_by=session.callsign, reason=reason)
        if not mission:
            await session.ws.send(json.dumps({
                "type": "mission_error",
                "error": f"Mission '{mission_id}' not found or not active",
            }))
            return

        await session.ws.send(json.dumps({
            "type": "mission_ok",
            "action": "cancelled",
            "mission": {"id": mission.id, "name": mission.name},
        }))

    elif action == "list":
        missions = mission_board.snapshot()
        await session.ws.send(json.dumps({
            "type": "missions",
            "missions": missions,
        }))

    else:
        await session.ws.send(json.dumps({
            "type": "mission_error",
            "error": f"Unknown mission action: {action}. Use create/update/cancel/list",
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

        # Send active missions on connect
        active_missions = mission_board.snapshot()
        if active_missions:
            await websocket.send(json.dumps({"type": "missions", "missions": active_missions}))

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

                elif msg_type == "voice_event":
                    await _handle_voice_event(session, data)

                elif msg_type == "mission":
                    await _handle_mission(session, data)

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
