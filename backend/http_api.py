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

    elif action == "scramble":
        # UI-triggered scramble — post SCRAMBLE_ORDER event to the bulletin
        aircraft = data.get("aircraft", [])
        if not aircraft:
            # Default: scramble ready aircraft from world state
            if _world_state_mgr:
                registry = _world_state_mgr.state.aircraft_registry
                aircraft = [
                    ac_id for ac_id, ac in registry.items()
                    if ac.get("serviceable") and ac.get("fuel_pct", 0) > 40
                    and ac.get("phase") not in ("GROUNDED", "AIRBORNE", "TAKEOFF")
                ]
            if not aircraft:
                aircraft = ["Gripen-01", "Gripen-02"]  # fallback pair
        bearing = data.get("bearing", 45)
        roe = data.get("roe", "WEAPONS_HOLD")
        event = bulletin.post(
            source="COMMAND",
            event_type="SCRAMBLE_ORDER",
            domain="SORTIE",
            severity="CRITICAL",
            payload={
                "message": f"SCRAMBLE SCRAMBLE SCRAMBLE. {len(aircraft)} aircraft immediate launch. "
                           f"Vector bearing {bearing:03d}. ROE: {roe}.",
                "aircraft": aircraft,
                "vector_bearing": bearing,
                "roe": roe,
                "ordered_by": data.get("ordered_by", "UI_COMMAND"),
            },
            tags=["scramble", "command"],
            source_layer="SYSTEM",
        )
        return web.json_response({"ok": True, "event_id": event.id,
                                   "aircraft": aircraft, "count": len(aircraft)})

    elif action == "recall":
        # Recall aircraft — post RECALL_ORDER
        aircraft = data.get("aircraft", [])
        reason = data.get("reason", "Command recall order")
        event = bulletin.post(
            source="COMMAND",
            event_type="RECALL_ORDER",
            domain="SORTIE",
            severity="HIGH",
            payload={
                "message": f"RECALL ORDER. {reason}. All airborne aircraft RTB immediately.",
                "aircraft": aircraft,
                "reason": reason,
                "ordered_by": data.get("ordered_by", "UI_COMMAND"),
            },
            tags=["recall", "command"],
            source_layer="SYSTEM",
        )
        return web.json_response({"ok": True, "event_id": event.id})

    elif action == "threat_update":
        # Manual threat level change from UI
        level = data.get("level", "AMBER").upper()
        if level not in ("GREEN", "AMBER", "RED"):
            return web.json_response(
                {"ok": False, "error": f"Invalid threat level: {level}"}, status=400)
        event = bulletin.post(
            source="COMMAND",
            event_type="THREAT_UPDATE",
            domain="THREAT",
            severity="CRITICAL" if level == "RED" else "HIGH" if level == "AMBER" else "INFO",
            payload={
                "message": f"Threat level updated to {level} by command authority.",
                "threat_level": level,
                "ordered_by": data.get("ordered_by", "UI_COMMAND"),
            },
            tags=["threat-update", "command"],
            source_layer="SYSTEM",
        )
        return web.json_response({"ok": True, "event_id": event.id, "level": level})

    elif action == "switch_scenario":
        scenario_key = data.get("scenario", "").lower()
        from scenarios import SCENARIOS, ScenarioRunner
        if scenario_key not in SCENARIOS:
            return web.json_response(
                {"ok": False, "error": f"Unknown scenario: {scenario_key}",
                 "valid": list(SCENARIOS.keys())}, status=400)
        # Stop existing runner if any, start new one
        runner = ScenarioRunner(scenario_key)
        runner.start()
        if _world_state_mgr:
            _world_state_mgr.state.scenario = scenario_key
        return web.json_response({"ok": True, "scenario": scenario_key,
                                   "name": SCENARIOS[scenario_key]["name"]})

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


# ── Reasoning transparency ───────────────────────────────────────────────────

async def get_agent_reasoning(request):
    """GET /agents/{aid}/reasoning — last reasoning context for transparency."""
    aid = request.match_info["aid"].upper()
    if aid not in _agent_map:
        return web.json_response(
            {"error": f"Unknown agent: {aid}", "valid": list(_agent_map.keys())},
            status=404)
    agent = _agent_map[aid]
    reasoning = agent.last_reasoning
    if not reasoning:
        return web.json_response({"agent_id": aid, "reasoning": None,
                                   "note": "No reasoning captured yet"})
    return web.json_response({"agent_id": aid, "reasoning": reasoning})


# ── Causal chain ─────────────────────────────────────────────────────────────

async def get_event_chain(request):
    """GET /events/{eid}/chain — walk upstream triggers + downstream reactions."""
    eid = request.match_info["eid"]
    chain = bulletin.build_causal_chain(eid)
    return web.json_response(chain)


# ── Aggregated summary ───────────────────────────────────────────────────────

async def get_summary(request):
    """GET /summary — aggregated domain status for the Lovable dashboard."""
    stats = bulletin.stats()
    agent_status = bulletin.agent_status()
    last_active = bulletin.domain_last_active()
    now = time.time()

    # Per-domain breakdown
    domains = {}
    for domain in ["SORTIE", "FUEL", "ARMING", "MAINTENANCE", "THREAT"]:
        domain_events = bulletin.read_domain(domain)
        recent_5min = [e for e in domain_events if (now - e.timestamp) < 300]
        recent_30min = [e for e in domain_events if (now - e.timestamp) < 1800]
        compensations = [e for e in domain_events if e.event_type == "AGENT_COMPENSATION"]
        domains[domain] = {
            "total_events": len(domain_events),
            "events_5min": len(recent_5min),
            "events_30min": len(recent_30min),
            "compensations": len(compensations),
            "last_event_age_s": round(now - domain_events[-1].timestamp) if domain_events else None,
        }

    # Agent health
    agents = {}
    for aid in ["OPS", "FUEL", "ARMING", "MAINT", "THREAT"]:
        obj = _agent_map.get(aid)
        agents[aid] = {
            "status": agent_status.get(aid, "unknown"),
            "alive": obj.is_alive() if obj else False,
            "seconds_since_action": (
                round(now - last_active[aid]) if aid in last_active else None
            ),
            "mode": _get_agent_mode(obj) if obj else "unknown",
        }

    # Mission summary
    try:
        active_missions = mission_board.get_active()
        missions = {
            "active": len(active_missions),
            "list": [
                {"id": m.id, "name": m.name, "priority": m.priority,
                 "domain": m.domain or "ALL", "status": m.status}
                for m in active_missions
            ][:10],
        }
    except Exception:
        missions = {"active": 0, "list": []}

    # Severity breakdown in last 5 minutes
    all_events = bulletin.read_all()
    recent_all = [e for e in all_events if (now - e.timestamp) < 300]
    severity_5min = {}
    for e in recent_all:
        severity_5min[e.severity] = severity_5min.get(e.severity, 0) + 1

    return web.json_response({
        "timestamp": now,
        "overall": stats,
        "severity_5min": severity_5min,
        "domains": domains,
        "agents": agents,
        "missions": missions,
    })


def _get_agent_mode(agent) -> str:
    """Determine what reasoning mode an agent is using."""
    if hasattr(agent, '_gclient') and agent._gclient:
        return "gemini"
    if hasattr(agent, '_orclient') and agent._orclient:
        return "openrouter"
    if hasattr(agent, '_client') and agent._client:
        return "claude"
    return "mock"


async def get_missions(request):
    include_all = request.query.get("all", "").lower() in ("true", "1")
    missions = mission_board.all_missions() if include_all else mission_board.snapshot()
    return web.json_response({"missions": missions})


async def get_world_state(request):
    """GET /world-state — full world state including aircraft registry."""
    if _world_state_mgr is None:
        return web.json_response({"error": "not ready"}, status=503)
    return web.json_response(_world_state_mgr.snapshot())


async def get_scenarios(request):
    """GET /scenarios — list available scenarios."""
    from scenarios import SCENARIOS
    result = {}
    for key, sc in SCENARIOS.items():
        result[key] = {"name": sc["name"], "description": sc["description"],
                        "event_count": len(sc["events"])}
    current = _world_state_mgr.state.scenario if _world_state_mgr else "unknown"
    return web.json_response({"scenarios": result, "current": current})


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
    app.router.add_get("/agents/{aid}/reasoning", get_agent_reasoning)
    app.router.add_get("/events", get_events)
    app.router.add_get("/events/{eid}/chain", get_event_chain)
    app.router.add_post("/control", post_control)
    app.router.add_get("/health", get_health)
    app.router.add_get("/summary", get_summary)
    app.router.add_get("/world-state", get_world_state)
    app.router.add_get("/scenarios", get_scenarios)
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
