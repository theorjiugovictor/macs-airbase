"""
World State — shared operational picture derived from bulletin events.

Purpose:
- Keep a mutable air base state that all agents implicitly share through the bulletin.
- Convert raw events (SYSTEM, SENSOR, AGENT) into state deltas.
- Broadcast state snapshots as WORLD_STATE_UPDATE events for observability/demo.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass

from shared_state import bulletin, Event


@dataclass
class WorldState:
    # Fuel
    fuel_level_pct: int = 75
    fuel_trucks_available: int = 2
    fuel_trucks_total: int = 2
    resupply_eta_hours: float = 0.0

    # Aircraft / sorties
    aircraft_total: int = 6
    aircraft_serviceable: int = 5
    aircraft_airborne: int = 0
    sortie_readiness_pct: int = 83

    # Ordnance
    ordnance_ready_pct: int = 100
    armed_aircraft: int = 4

    # Maintenance
    maintenance_queue: int = 0
    aircraft_grounded: int = 0

    # Threat picture
    threat_level: str = "GREEN"
    radar_tracks: int = 0
    ew_jamming: bool = False
    comms_coverage_pct: int = 100

    # Base posture
    bases_active: int = 1
    dispersal_active: bool = False
    scenario: str = "unknown"
    updated_at: float = 0.0

    # Per-aircraft tracking  (populated from AIRCRAFT_TELEMETRY sensor events)
    # Each entry: {"id", "phase", "pad", "fuel_pct", "loadout", "pilot",
    #              "serviceable", "heading", "altitude_ft", "speed_kts",
    #              "flight_time_min", "hours_since_inspection"}
    aircraft_registry: dict = None  # ac_id -> dict

    def __post_init__(self):
        if self.aircraft_registry is None:
            self.aircraft_registry = {}


class WorldStateManager:
    EMIT_COOLDOWN = 15.0  # seconds — don't spam world-state updates

    def __init__(self, scenario_key: str = "surge"):
        self._lock = threading.RLock()
        self.state = WorldState(scenario=scenario_key, updated_at=time.time())
        self._last_emit_time = 0.0
        self._pending_reason: str | None = None

    def bootstrap(self):
        """Emit initial state so dashboard has a baseline."""
        self._last_emit_time = 0.0
        self._emit("bootstrap")

    def observe(self, event: Event):
        """Observe bulletin events and apply state transitions."""
        if event.event_type in {
            "WORLD_STATE_INIT", "WORLD_STATE_UPDATE", "WORLD_STATE_SNAPSHOT"
        }:
            return

        changed = False
        with self._lock:
            changed |= self._apply_payload_fields(event)

            if event.event_type == "ACTION_TAKEN":
                changed |= self._apply_action_effects(event)

            self.state.updated_at = time.time()

        if changed:
            self._try_emit(f"from {event.id} {event.event_type}")

    def snapshot(self) -> dict:
        with self._lock:
            s = self.state
            return {
                "scenario": s.scenario,
                "updated_at": s.updated_at,
                "fuel": {
                    "level_pct": s.fuel_level_pct,
                    "trucks_available": s.fuel_trucks_available,
                    "trucks_total": s.fuel_trucks_total,
                    "resupply_eta_hours": round(s.resupply_eta_hours, 1),
                },
                "sorties": {
                    "aircraft_total": s.aircraft_total,
                    "aircraft_serviceable": s.aircraft_serviceable,
                    "aircraft_airborne": s.aircraft_airborne,
                    "readiness_pct": s.sortie_readiness_pct,
                },
                "arming": {
                    "ordnance_ready_pct": s.ordnance_ready_pct,
                    "armed_aircraft": s.armed_aircraft,
                },
                "maintenance": {
                    "queue": s.maintenance_queue,
                    "grounded": s.aircraft_grounded,
                },
                "threat": {
                    "level": s.threat_level,
                    "radar_tracks": s.radar_tracks,
                    "ew_jamming": s.ew_jamming,
                    "comms_coverage_pct": s.comms_coverage_pct,
                },
                "base": {
                    "bases_active": s.bases_active,
                    "dispersal_active": s.dispersal_active,
                },
                "aircraft": {
                    ac_id: dict(ac) for ac_id, ac in s.aircraft_registry.items()
                },
            }

    # ── Internals ───────────────────────────────────────────────────────────

    def _clamp(self):
        s = self.state
        s.fuel_level_pct = max(0, min(100, s.fuel_level_pct))
        s.fuel_trucks_available = max(0, min(s.fuel_trucks_total, s.fuel_trucks_available))
        s.aircraft_serviceable = max(0, min(s.aircraft_total, s.aircraft_serviceable))
        s.aircraft_airborne = max(0, min(s.aircraft_serviceable, s.aircraft_airborne))
        s.aircraft_grounded = max(0, min(s.aircraft_total, s.aircraft_grounded))
        s.sortie_readiness_pct = max(0, min(100, s.sortie_readiness_pct))
        s.ordnance_ready_pct = max(0, min(100, s.ordnance_ready_pct))
        s.armed_aircraft = max(0, min(s.aircraft_total, s.armed_aircraft))
        s.maintenance_queue = max(0, min(20, s.maintenance_queue))
        s.radar_tracks = max(0, min(50, s.radar_tracks))
        s.comms_coverage_pct = max(0, min(100, s.comms_coverage_pct))
        s.bases_active = max(1, min(5, s.bases_active))
        s.resupply_eta_hours = max(0.0, min(48.0, s.resupply_eta_hours))

    def _apply_payload_fields(self, event: Event) -> bool:
        s = self.state
        p = event.payload or {}
        before = self.snapshot()

        # Fuel
        if "fuel_level_pct" in p:
            s.fuel_level_pct = int(p["fuel_level_pct"])
        if "trucks_available" in p:
            s.fuel_trucks_available = int(p["trucks_available"])
        if "resupply_eta_hours" in p:
            s.resupply_eta_hours = float(p["resupply_eta_hours"])
        if "new_eta_hours" in p:
            s.resupply_eta_hours = float(p["new_eta_hours"])

        # Aircraft serviceability
        if "aircraft_serviceable" in p:
            s.aircraft_serviceable = int(p["aircraft_serviceable"])
        if "aircraft_count" in p:
            s.aircraft_total = max(s.aircraft_total, int(p["aircraft_count"]))
        if event.event_type == "AIRCRAFT_GROUNDED":
            s.aircraft_grounded += 1
            s.aircraft_serviceable = max(0, s.aircraft_serviceable - 1)
            s.maintenance_queue += 1
            s.sortie_readiness_pct -= 15
        if event.event_type == "MAINTENANCE_COMPLETE":
            s.aircraft_grounded = max(0, s.aircraft_grounded - 1)
            s.aircraft_serviceable = min(s.aircraft_total, s.aircraft_serviceable + 1)
            s.maintenance_queue = max(0, s.maintenance_queue - 1)
            s.sortie_readiness_pct += 12

        # Ordnance
        if event.event_type in {"ORDNANCE_DEMAND", "ORDNANCE_DECISION"}:
            s.ordnance_ready_pct = max(0, s.ordnance_ready_pct - 20)

        # Sorties
        if event.event_type == "TASKING_ORDER":
            sorties_req = int(p.get("sorties_required", 0))
            if sorties_req > s.aircraft_serviceable:
                s.sortie_readiness_pct -= 10
        if event.event_type == "SCRAMBLE_ORDER":
            launched = len(p.get("aircraft", []))
            s.aircraft_airborne = min(s.aircraft_serviceable, s.aircraft_airborne + launched)
        if event.event_type == "INTERCEPT_UPDATE":
            pass  # status only

        # Threat
        if "threat_level" in p:
            s.threat_level = str(p["threat_level"])
        if "tracks" in p:
            s.radar_tracks = int(p["tracks"])
        if event.event_type == "THREAT_RESOLVED":
            s.radar_tracks = 0
            s.threat_level = str(p.get("threat_level", "GREEN"))
            s.ew_jamming = False
        if event.event_type == "EW_JAMMING":
            s.ew_jamming = True
            degradation = int(p.get("coverage_degradation_pct", 10))
            s.comms_coverage_pct -= degradation
        if "coverage_pct" in p:
            s.comms_coverage_pct = int(p["coverage_pct"])
        if event.event_type == "COMMS_DEGRADED":
            s.comms_coverage_pct = max(20, s.comms_coverage_pct - 30)

        # Dispersal
        if event.event_type == "DISPERSAL_ORDER":
            s.dispersal_active = True
        if event.event_type == "DISPERSAL_STATUS":
            bravo = int(p.get("bravo_aircraft", 0))
            charlie = int(p.get("charlie_aircraft", 0))
            if bravo + charlie > 0:
                s.bases_active = 2 if charlie == 0 else 3

        # Aircraft telemetry — per-aircraft state updates from sensor sim
        if event.event_type == "AIRCRAFT_TELEMETRY":
            for ac_data in p.get("aircraft", []):
                ac_id = ac_data.get("id")
                if ac_id:
                    s.aircraft_registry[ac_id] = dict(ac_data)
            # Derive aggregate counts from registry when we have enough data
            if len(s.aircraft_registry) >= 3:
                s.aircraft_total = len(s.aircraft_registry)
                s.aircraft_serviceable = sum(
                    1 for a in s.aircraft_registry.values() if a.get("serviceable", True)
                )
                s.aircraft_airborne = sum(
                    1 for a in s.aircraft_registry.values() if a.get("phase") == "AIRBORNE"
                )
                s.aircraft_grounded = sum(
                    1 for a in s.aircraft_registry.values() if a.get("phase") == "GROUNDED"
                )

        self._clamp()
        return before != self.snapshot()

    def _apply_action_effects(self, event: Event) -> bool:
        """Apply world-state deltas from ACTION_TAKEN events.

        Uses keyword extraction from the message to infer effects,
        making this resilient to both scripted mock responses and
        free-form LLM-generated messages.
        """
        s = self.state
        before = self.snapshot()
        domain = (event.domain or "").upper()
        msg = str((event.payload or {}).get("message", "")).lower()

        if domain == "FUEL":
            # Refueling actions
            if any(kw in msg for kw in ("refuel", "truck", "fueling", "tanker", "deploying fuel", "jp-8")):
                s.fuel_level_pct = min(100, s.fuel_level_pct + 5)
            # Resupply / convoy progress
            if any(kw in msg for kw in ("resupply", "convoy", "replenish")):
                s.resupply_eta_hours = max(0.0, s.resupply_eta_hours - 0.5)
            # Emergency fuel measures
            if any(kw in msg for kw in ("emergency fuel", "reserve", "rationing")):
                s.fuel_level_pct = min(100, s.fuel_level_pct + 2)
        elif domain == "SORTIE":
            s.sortie_readiness_pct = min(100, s.sortie_readiness_pct + 5)
            # Scramble / launch
            if any(kw in msg for kw in ("launch", "scramble", "airborne", "taking off")):
                s.aircraft_airborne = min(s.aircraft_serviceable, s.aircraft_airborne + 1)
            # Readiness improvements
            if any(kw in msg for kw in ("readiness", "cleared", "mission-ready")):
                s.sortie_readiness_pct = min(100, s.sortie_readiness_pct + 3)
        elif domain == "ARMING":
            if any(kw in msg for kw in ("armed", "arming complete", "weapons", "loaded", "ordnance", "iris-t", "amraam")):
                s.ordnance_ready_pct = min(100, s.ordnance_ready_pct + 10)
                s.armed_aircraft = min(s.aircraft_total, s.armed_aircraft + 1)
            elif any(kw in msg for kw in ("reconfigur", "swap")):
                s.ordnance_ready_pct = max(0, s.ordnance_ready_pct - 5)
        elif domain == "MAINTENANCE":
            if any(kw in msg for kw in ("repair complete", "cleared", "serviceable", "inspection complete", "nominal")):
                s.maintenance_queue = max(0, s.maintenance_queue - 1)
                s.sortie_readiness_pct = min(100, s.sortie_readiness_pct + 5)
                s.aircraft_serviceable = min(s.aircraft_total, s.aircraft_serviceable + 1)
            elif any(kw in msg for kw in ("grounding", "grounded", "flagged", "fault")):
                s.maintenance_queue += 1
                s.sortie_readiness_pct = max(0, s.sortie_readiness_pct - 5)
            else:
                s.sortie_readiness_pct = min(100, s.sortie_readiness_pct + 3)
        elif domain == "THREAT":
            if any(kw in msg for kw in ("corridor", "safe", "clear", "downgrad", "friendly", "resolved")):
                s.comms_coverage_pct = min(100, s.comms_coverage_pct + 5)
                # Downgrade threat if language suggests de-escalation
                if any(kw in msg for kw in ("downgrad", "friendly", "resolved", "green")):
                    s.threat_level = "GREEN"
                    s.radar_tracks = max(0, s.radar_tracks - 1)
            if any(kw in msg for kw in ("jamming", "ew ", "electronic warfare")):
                s.ew_jamming = True
                s.comms_coverage_pct = max(20, s.comms_coverage_pct - 10)
            if any(kw in msg for kw in ("amber", "elevat", "posture")):
                s.threat_level = "AMBER"

        self._clamp()
        return before != self.snapshot()

    def _try_emit(self, reason: str):
        now = time.time()
        if now - self._last_emit_time >= self.EMIT_COOLDOWN:
            self._emit(reason)
        else:
            self._pending_reason = reason

    def flush_pending(self):
        if self._pending_reason and (time.time() - self._last_emit_time >= self.EMIT_COOLDOWN):
            reason = self._pending_reason
            self._pending_reason = None
            self._emit(reason)

    def _emit(self, reason: str):
        self._last_emit_time = time.time()
        self._pending_reason = None
        snap = self.snapshot()
        fuel = snap["fuel"]
        sorties = snap["sorties"]
        threat = snap["threat"]

        summary = (
            f"WS {reason}: fuel={fuel['level_pct']}%, "
            f"readiness={sorties['readiness_pct']}%, "
            f"serviceable={sorties['aircraft_serviceable']}/{sorties['aircraft_total']}, "
            f"threat={threat['level']}, "
            f"tracks={threat['radar_tracks']}, "
            f"comms={threat['comms_coverage_pct']}%"
        )

        bulletin.post(
            source="SYSTEM",
            event_type="WORLD_STATE_UPDATE",
            domain="SYSTEM",
            severity="INFO",
            source_layer="SYSTEM",
            payload={
                "message": summary,
                "reason": reason,
                "state": snap,
            },
            tags=["world-state"],
        )


def start_world_state(scenario_key: str = "surge") -> WorldStateManager:
    mgr = WorldStateManager(scenario_key=scenario_key)
    bulletin.subscribe(mgr.observe)
    mgr.bootstrap()
    return mgr
