"""
Air Base Scenarios — timed event injection into the bulletin board.

Each scenario has a sequence of SYSTEM events injected at defined offsets.
Agents perceive these events and respond autonomously — no agent is told what to do.

The cascade is the emergence.
"""

import time
import threading
from dataclasses import dataclass
from shared_state import bulletin


@dataclass
class ScenarioEvent:
    delay: float          # seconds after scenario start
    event_type: str
    domain: str
    severity: str
    payload: dict
    tags: list = None


SCENARIOS = {
    "surge": {
        "name": "Sortie Surge",
        "description": (
            "High-priority tasking demands rapid turnaround. Fuel is running low, "
            "the aircraft queue backs up, MAINT grounds one aircraft with a fault. "
            "Watch OPS, FUEL, ARMING, MAINT, and THREAT self-coordinate the surge."
        ),
        "events": [
            ScenarioEvent(
                delay=0,
                event_type="TASKING_ORDER",
                domain="SORTIE",
                severity="HIGH",
                payload={
                    "message": "HQ tasking order received. 6 sorties required within 90-minute window. "
                               "Current readiness: 3 aircraft serviceable. Surge protocol activated.",
                    "sorties_required": 6,
                    "window_minutes": 90,
                    "aircraft_serviceable": 3,
                },
                tags=["tasking", "surge", "cascade-trigger"],
            ),
            ScenarioEvent(
                delay=25,
                event_type="FUEL_LOW",
                domain="FUEL",
                severity="HIGH",
                payload={
                    "message": "JP-8 reserves at 38%. Fuel truck 2 unserviceable — fuel pump fault. "
                               "Single truck handling full pad queue. Resupply convoy ETA: 4 hours.",
                    "fuel_level_pct": 38,
                    "trucks_available": 1,
                    "trucks_total": 2,
                    "resupply_eta_hours": 4,
                },
                tags=["fuel-low", "surge"],
            ),
            ScenarioEvent(
                delay=60,
                event_type="AIRCRAFT_GROUNDED",
                domain="MAINTENANCE",
                severity="HIGH",
                payload={
                    "message": "Aircraft Gripen-04 grounded. Pre-flight detected hydraulic pressure loss "
                               "in starboard brake system. Estimated repair: 45 minutes.",
                    "aircraft_id": "Gripen-04",
                    "fault": "hydraulic-pressure-loss",
                    "system": "starboard-brake",
                    "repair_eta_minutes": 45,
                },
                tags=["aircraft-grounded", "hydraulic", "surge"],
            ),
            ScenarioEvent(
                delay=100,
                event_type="ORDNANCE_DEMAND",
                domain="ARMING",
                severity="HIGH",
                payload={
                    "message": "Mission profile updated: 4 aircraft require air-to-ground loadout swap. "
                               "Current config: air-to-air. Reconfig time: 25 min per aircraft.",
                    "aircraft_count": 4,
                    "current_loadout": "air-to-air",
                    "required_loadout": "air-to-ground",
                    "reconfig_minutes": 25,
                },
                tags=["ordnance-reconfig", "surge"],
            ),
            ScenarioEvent(
                delay=150,
                event_type="THREAT_UPDATE",
                domain="THREAT",
                severity="AMBER",
                payload={
                    "message": "Radar contact: 2 unidentified tracks bearing 045, altitude 8000ft, "
                               "speed 480 knots. IFF squawk negative. Threat level elevated to AMBER.",
                    "tracks": 2,
                    "bearing": 45,
                    "altitude_ft": 8000,
                    "speed_knots": 480,
                    "iff": "negative",
                    "threat_level": "AMBER",
                },
                tags=["radar-track", "unknown-track", "surge"],
            ),
            ScenarioEvent(
                delay=210,
                event_type="FUEL_RESUPPLY_UPDATE",
                domain="FUEL",
                severity="HIGH",
                payload={
                    "message": "Resupply convoy reports delay — road Alpha blocked at checkpoint 7. "
                               "New ETA: 6 hours. Emergency fuel allocation required.",
                    "convoy_delay_hours": 2,
                    "new_eta_hours": 6,
                    "blockage_location": "checkpoint-7",
                },
                tags=["fuel-delay", "convoy", "surge"],
            ),
            ScenarioEvent(
                delay=300,
                event_type="MAINTENANCE_COMPLETE",
                domain="MAINTENANCE",
                severity="INFO",
                payload={
                    "message": "Gripen-04 hydraulic repair complete. Aircraft returned to serviceable. "
                               "Post-repair inspection passed. Available for immediate tasking.",
                    "aircraft_id": "Gripen-04",
                    "status": "serviceable",
                },
                tags=["repair-complete", "surge"],
            ),
        ],
    },

    "scramble": {
        "name": "Combat Air Patrol Scramble",
        "description": (
            "Radar detects fast-moving hostile track. Threat escalates from AMBER to RED. "
            "Intercept required. Watch THREAT direct the picture as OPS scrambles Gripen pair "
            "and ARMING validates air-defense loadout."
        ),
        "events": [
            ScenarioEvent(
                delay=0,
                event_type="RADAR_CONTACT",
                domain="THREAT",
                severity="AMBER",
                payload={
                    "message": "Radar contact. Single track bearing 270, altitude 24,000ft, "
                               "speed 620 knots inbound. IFF squawk: invalid code. Threat: AMBER.",
                    "tracks": 1,
                    "bearing": 270,
                    "altitude_ft": 24000,
                    "speed_knots": 620,
                    "iff": "invalid",
                    "threat_level": "AMBER",
                    "range_nm": 80,
                },
                tags=["radar-contact", "cascade-trigger"],
            ),
            ScenarioEvent(
                delay=30,
                event_type="THREAT_ESCALATION",
                domain="THREAT",
                severity="CRITICAL",
                payload={
                    "message": "Track now correlates with hostile profile. EW suite detecting radar "
                               "lock-on emissions. Threat level upgraded to RED. Scramble authorized.",
                    "threat_level": "RED",
                    "ew_detected": "radar-lock-on",
                    "range_nm": 65,
                    "time_to_intercept_minutes": 8,
                },
                tags=["threat-red", "ew-detection", "scramble"],
            ),
            ScenarioEvent(
                delay=50,
                event_type="SCRAMBLE_ORDER",
                domain="SORTIE",
                severity="CRITICAL",
                payload={
                    "message": "SCRAMBLE SCRAMBLE SCRAMBLE. Gripen pair (01, 02) immediate launch. "
                               "CAP vector: 270 degrees, climb to FL240. ROE: Weapons free on positive ID.",
                    "aircraft": ["Gripen-01", "Gripen-02"],
                    "vector_bearing": 270,
                    "altitude_fl": 240,
                    "roe": "weapons-free-positive-id",
                },
                tags=["scramble", "cap"],
            ),
            ScenarioEvent(
                delay=70,
                event_type="ARMING_STATUS",
                domain="ARMING",
                severity="HIGH",
                payload={
                    "message": "Gripen-01 confirmed AIM-120 x4 + AIM-9 x2. Gripen-02 loadout "
                               "verification: AIM-120 x2 loaded, x2 pending IFF safeties check.",
                    "aircraft_01": {"aim_120": 4, "aim_9": 2, "status": "ready"},
                    "aircraft_02": {"aim_120": 2, "aim_9": 0, "status": "pending-iff"},
                },
                tags=["arming-status", "scramble"],
            ),
            ScenarioEvent(
                delay=100,
                event_type="EW_JAMMING",
                domain="THREAT",
                severity="CRITICAL",
                payload={
                    "message": "Active jamming detected on primary radar frequency. "
                               "Switching to secondary frequency. 30% coverage degradation.",
                    "jamming_frequency": "primary",
                    "coverage_degradation_pct": 30,
                    "switching_to": "secondary-frequency",
                },
                tags=["ew-jamming", "radar-degraded"],
            ),
            ScenarioEvent(
                delay=150,
                event_type="INTERCEPT_UPDATE",
                domain="SORTIE",
                severity="HIGH",
                payload={
                    "message": "Gripen-01 airborne. Gripen-02 rolling. CAP station ETA: 6 minutes. "
                               "AWACS relay established. Track now at range 40nm.",
                    "gripen_01": "airborne",
                    "gripen_02": "rolling",
                    "track_range_nm": 40,
                    "awacs": "relay-established",
                },
                tags=["intercept", "scramble"],
            ),
            ScenarioEvent(
                delay=210,
                event_type="THREAT_RESOLVED",
                domain="THREAT",
                severity="INFO",
                payload={
                    "message": "Track altered course bearing 340 — exiting engagement zone. "
                               "No weapons employed. Threat level returning to GREEN. CAP maintaining station.",
                    "threat_level": "GREEN",
                    "track_action": "course-change-egress",
                    "weapons_employed": False,
                },
                tags=["threat-resolved", "scramble"],
            ),
        ],
    },

    "disperse": {
        "name": "Emergency Base Dispersal",
        "description": (
            "Hostile threat forces emergency dispersal of aircraft to alternate road bases. "
            "Base must split operations across 3 sites under threat, with degraded comms. "
            "Watch all agents coordinate the split under pressure."
        ),
        "events": [
            ScenarioEvent(
                delay=0,
                event_type="DISPERSAL_ORDER",
                domain="SORTIE",
                severity="CRITICAL",
                payload={
                    "message": "DISPERSAL ORDER. Hostile ground forces within 40km. "
                               "Immediate dispersal to alternate road bases Bravo and Charlie. "
                               "All aircraft to depart within 20 minutes.",
                    "threat_distance_km": 40,
                    "alternate_bases": ["Bravo", "Charlie"],
                    "departure_window_minutes": 20,
                    "aircraft_count": 6,
                },
                tags=["dispersal", "cascade-trigger"],
            ),
            ScenarioEvent(
                delay=25,
                event_type="FUEL_CONSTRAINT",
                domain="FUEL",
                severity="HIGH",
                payload={
                    "message": "Forward fuel reserves at base Bravo: 60%. Base Charlie: 40%. "
                               "Fuel trucks cannot accompany — road route compromised. "
                               "Aircraft must depart with full internal tanks.",
                    "bravo_fuel_pct": 60,
                    "charlie_fuel_pct": 40,
                    "trucks_can_follow": False,
                    "reason": "road-route-compromised",
                },
                tags=["fuel-constraint", "dispersal"],
            ),
            ScenarioEvent(
                delay=55,
                event_type="ORDNANCE_DECISION",
                domain="ARMING",
                severity="HIGH",
                payload={
                    "message": "Insufficient time for full ordnance download. Decision: 4 aircraft "
                               "depart armed (air defense loadout). 2 aircraft ordnance download "
                               "in progress — estimated 8 minutes remaining.",
                    "aircraft_departing_armed": 4,
                    "aircraft_download_remaining": 2,
                    "download_eta_minutes": 8,
                },
                tags=["ordnance-decision", "dispersal"],
            ),
            ScenarioEvent(
                delay=80,
                event_type="COMMS_DEGRADED",
                domain="THREAT",
                severity="HIGH",
                payload={
                    "message": "Primary comms relay overrun. HF backup only. "
                               "Coordination between dispersal sites degraded. "
                               "MACS Airbase agents operating autonomously until relay re-established.",
                    "primary_comms": "lost",
                    "backup": "HF-radio",
                    "coordination_status": "degraded",
                },
                tags=["comms-degraded", "dispersal"],
            ),
            ScenarioEvent(
                delay=120,
                event_type="AIRCRAFT_SERVICEABILITY",
                domain="MAINTENANCE",
                severity="HIGH",
                payload={
                    "message": "Gripen-05 cannot depart — landing gear fault detected during pre-dispersal check. "
                               "Aircraft must be left at base. Maintenance team to remain for recovery attempt.",
                    "aircraft_id": "Gripen-05",
                    "fault": "landing-gear",
                    "action": "remain-at-base",
                    "team_staying": True,
                },
                tags=["aircraft-fault", "dispersal"],
            ),
            ScenarioEvent(
                delay=180,
                event_type="DISPERSAL_STATUS",
                domain="SORTIE",
                severity="HIGH",
                payload={
                    "message": "Dispersal update: 4 aircraft departed for Bravo, 1 for Charlie. "
                               "1 aircraft on ground with fault. Base Alpha now to skeleton crew only. "
                               "Operations transferring to Bravo as primary.",
                    "bravo_aircraft": 4,
                    "charlie_aircraft": 1,
                    "grounded_aircraft": 1,
                    "primary_base": "Bravo",
                },
                tags=["dispersal-status"],
            ),
            ScenarioEvent(
                delay=270,
                event_type="THREAT_PROXIMITY",
                domain="THREAT",
                severity="CRITICAL",
                payload={
                    "message": "Hostile forces now 18km. Ground threat confirmed. "
                               "All non-essential personnel evacuating base Alpha. "
                               "Air threat: AMBER. Request CAP coverage over Bravo.",
                    "hostile_distance_km": 18,
                    "threat_level": "AMBER",
                    "personnel_status": "evacuating",
                    "cap_requested_over": "Bravo",
                },
                tags=["threat-proximity", "dispersal"],
            ),
        ],
    },
}


class ScenarioRunner:
    def __init__(self, scenario_key: str):
        self.scenario = SCENARIOS[scenario_key]
        self._thread: threading.Thread = None
        self._running = False

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name="scenario-runner")
        self._thread.start()
        bulletin.post(
            source="SYSTEM",
            event_type="SCENARIO_START",
            domain="SYSTEM",
            severity="INFO",
            source_layer="SYSTEM",
            payload={
                "scenario": self.scenario["name"],
                "description": self.scenario["description"],
            },
            tags=["scenario"],
        )

    def _run(self):
        start_time = time.time()
        events = sorted(self.scenario["events"], key=lambda e: e.delay)

        for scenario_event in events:
            if not self._running:
                break
            elapsed = time.time() - start_time
            wait = scenario_event.delay - elapsed
            if wait > 0:
                time.sleep(wait)
            if not self._running:
                break
            bulletin.post(
                source="SYSTEM",
                event_type=scenario_event.event_type,
                domain=scenario_event.domain,
                severity=scenario_event.severity,
                source_layer="SYSTEM",
                payload=scenario_event.payload,
                tags=(scenario_event.tags or []),
            )

    def stop(self):
        self._running = False

    @staticmethod
    def list_scenarios() -> list[dict]:
        return [
            {"key": k, "name": v["name"], "description": v["description"]}
            for k, v in SCENARIOS.items()
        ]
