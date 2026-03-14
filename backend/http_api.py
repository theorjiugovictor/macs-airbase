"""
HTTP API - REST layer for ElevenLabs voice agent webhook tools.

Runs on port 8080 alongside the WebSocket server (8765).
"""

import asyncio
import json
import logging
import threading
import time
from dataclasses import asdict

from aiohttp import web
from aiohttp.web import middleware

from shared_state import bulletin
from mission_board import mission_board

logger = logging.getLogger(__name__)

_agent_map = {}
_world_state_mgr = None


@middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        resp = web.Response(status=204)
    else:
        try:
            resp = await handler(request)
        except web.HTTPException as ex:
            resp = ex
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return resp


async def get_status(request):
    if _world_state_mgr is None:
        return web.json_response({"error": "not ready"}, status=503)
    return web.json_response(_world_state_mgr.snapshot())


async def get_agents(request):
    status_map = bulletin.agent_status()
    last_active = bulletin.domain_last_active()
    agents = {}
    for aid in ["OPS", "FUEL", "ARMING", "MAINT", "THREAT"]:
        obj = _agent_map.get(aid)
        agents[aid] = {
            "status": status_map.get(aid, "unknown"),
            "alive": obj.is_alive() if obj else False,
            "last_active": last_active.get(aid),
            "seconds_since_action": (
                round(time.time() - last_active[aid], 1)
                if aid in last_active else None
            ),
        }
    return web.json_response({"agents": agents})


async def get_events(request):
    limit = min(int(request.query.get("limit", "20")), 200)
    domain = request.query.get("domain", "").upper()
    etype = request.query.get("type", "").upper()

    events = bulletin.snapshot(max_events=200)
    if domain:
        events = [e for e in events if e.get("domain") == domain]
    if etype:
        events = [e for e in events if e.get("event_type") == etype]

    return web.json_response({"events": events[-limit:], "count": min(len(events), limit)})


async def post_control(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

    action = data.get("action", "")

    if action == "inject_event":
        event = bulletin.post(
            source="SYSTEM",
            event_type=data.get("event_type", "SCENARIO_EVENT"),
            domain=data.get("domain", "SYSTEM").upper(),
            severity=data.get("severity", "HIGH").upper(),
            payload={"message": data.get("message", "Voice-injected event"),
                     "injected_by": "voice_agent"},
            tags=["voice-injected"],
            source_layer="SYSTEM",
        )
        return web.json_response({"ok": True, "event_id": event.id})

    elif action == "kill_agent":
        aid = data.get("agent_id", "").upper()
        if aid not in _agent_map:
            return web.json_response(
                {"ok": False, "error": f"Unknown agent: {aid}",
                 "valid": list(_agent_map.keys())}, status=400)
        if not _agent_map[aid].is_alive():
            return web.json_response({"ok": True, "note": f"{aid} already offline"})
        _agent_map[aid].stop()
        return web.json_response({"ok": True, "killed": aid})

    elif action == "revive_agent":
        aid = data.get("agent_id", "").upper()
        if aid not in _agent_map:
            return web.json_response(
                {"ok": False, "error": f"Unknown agent: {aid}",
                 "valid": list(_agent_map.keys())}, status=400)
        if _agent_map[aid].is_alive():
            return web.json_response({"ok": True, "note": f"{aid} already online"})
        _agent_map[aid].start()
        return web.json_response({"ok": True, "revived": aid})

    return web.json_response(
        {"ok": False, "error": f"Unknown action: {action}"}, status=400)


async def get_health(request):
    alive = sum(1 for a in _agent_map.values() if a.is_alive())
    return web.json_response({
        "status": "ok",
        "agents_alive": alive,
        "agents_total": len(_agent_map),
        "events": bulletin.stats()["total_events"],
    })


async def get_missions(request):
    include_all = request.query.get("all", "").lower() in ("true", "1")
    missions = mission_board.all_missions() if include_all else mission_board.snapshot()
    return web.json_response({"missions": missions})


async def post_missions(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

    action = data.get("action", "")

    if action == "create":
        name = data.get("name", "").strip()
        if not name:
            return web.json_response({"ok": False, "error": "Mission name required"}, status=400)
        mission = mission_board.create(
            name=name,
            description=data.get("description", ""),
            domain=data.get("domain"),
            priority=data.get("priority", "HIGH"),
            duration_min=float(data.get("duration_min", 60)),
            created_by=data.get("created_by", "API"),
            parameters=data.get("parameters", {}),
        )
        from dataclasses import asdict
        return web.json_response({"ok": True, "mission": asdict(mission)})

    elif action == "cancel":
        mid = data.get("mission_id", "")
        mission = mission_board.cancel(mid, cancelled_by=data.get("cancelled_by", "API"))
        if not mission:
            return web.json_response({"ok": False, "error": f"Mission '{mid}' not found"}, status=404)
        from dataclasses import asdict
        return web.json_response({"ok": True, "mission": asdict(mission)})

    return web.json_response({"ok": False, "error": f"Unknown action: {action}"}, status=400)


def start_http_api(agent_map, world_state_mgr, port=8080):
    global _agent_map, _world_state_mgr
    _agent_map = agent_map
    _world_state_mgr = world_state_mgr

    app = web.Application(middlewares=[cors_middleware])
    app.router.add_get("/status", get_status)
    app.router.add_get("/agents", get_agents)
    app.router.add_get("/events", get_events)
    app.router.add_post("/control", post_control)
    app.router.add_get("/health", get_health)
    app.router.add_get("/missions", get_missions)
    app.router.add_post("/missions", post_missions)

    runner = web.AppRunner(app)

    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(runner.setup())
        site = web.TCPSite(runner, "0.0.0.0", port)
        loop.run_until_complete(site.start())
        logger.info(f"HTTP API on http://0.0.0.0:{port}")
        loop.run_forever()

    threading.Thread(target=_run, daemon=True, name="http-api").start()
