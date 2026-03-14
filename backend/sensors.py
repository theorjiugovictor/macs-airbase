"""
Mock Sensor Simulator — generates realistic SENSOR-layer events.

Simulates hardware feeds that would exist on a real road base:
  - Radar tracks (bearing, altitude, speed, IFF)
  - Fuel gauge telemetry (tank levels, flow rates)
  - Weather station (wind, ceiling, visibility)
  - EW detection (jamming, emissions)
  - Perimeter sensors (motion, acoustic, seismic)

All events are posted to the bulletin board with source_layer="SENSOR",
which agents treat as GROUND TRUTH (highest confidence).

Usage:
    from sensors import SensorSimulator
    sim = SensorSimulator(scenario="surge")
    sim.start()   # background thread
    sim.stop()
"""

from __future__ import annotations

import random
import time
import threading
import logging
from typing import Optional

from shared_state import bulletin

logger = logging.getLogger(__name__)


# ── Sensor Configuration ────────────────────────────────────────────────────

class SensorConfig:
    """Tunable knobs per scenario."""

    def __init__(self, scenario: str = "surge"):
        self.scenario = scenario

        # Radar — how often tracks appear, base probability
        self.radar_interval = 45       # seconds between radar sweeps
        self.radar_track_prob = 0.3    # prob of new track per sweep
        self.radar_hostile_prob = 0.15 # prob a new track is hostile

        # Fuel gauges — telemetry interval
        self.fuel_interval = 60
        self.fuel_drain_rate = 0.4     # % per interval (base ops)

        # Weather — update interval
        self.weather_interval = 120
        self.weather_degrade_prob = 0.1

        # EW — electronic warfare detection
        self.ew_interval = 50
        self.ew_jamming_prob = 0.08

        # Perimeter — motion/acoustic sensors
        self.perimeter_interval = 35
        self.perimeter_alert_prob = 0.05

        # Aircraft telemetry — per-aircraft status updates
        self.aircraft_interval = 30
        self.aircraft_count = 6

        # Scenario-specific tuning
        if scenario == "scramble":
            self.radar_track_prob = 0.6
            self.radar_hostile_prob = 0.4
            self.ew_jamming_prob = 0.2
            self.perimeter_alert_prob = 0.1
        elif scenario == "disperse":
            self.radar_hostile_prob = 0.3
            self.ew_jamming_prob = 0.15
            self.perimeter_alert_prob = 0.15
            self.fuel_drain_rate = 0.6


# ── Sensor Data Generators ──────────────────────────────────────────────────

BEARINGS = list(range(0, 360, 15))
CALLSIGNS = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]
AIRCRAFT_IDS = [f"Gripen-{i:02d}" for i in range(1, 9)]

WEATHER_CONDITIONS = [
    {"ceiling_ft": 25000, "visibility_km": 15, "wind_kts": 8, "condition": "CAVOK"},
    {"ceiling_ft": 8000, "visibility_km": 10, "wind_kts": 15, "condition": "SCT"},
    {"ceiling_ft": 3000, "visibility_km": 5, "wind_kts": 22, "condition": "BKN"},
    {"ceiling_ft": 1500, "visibility_km": 2, "wind_kts": 30, "condition": "OVC"},
    {"ceiling_ft": 500, "visibility_km": 0.8, "wind_kts": 35, "condition": "IFR"},
]


def _gen_radar_sweep(cfg: SensorConfig, state: dict) -> Optional[dict]:
    """Simulate a radar sweep. Returns event data or None."""
    # Chance of new track
    if random.random() > cfg.radar_track_prob:
        # No new track — but report sweep completed
        if state.get("active_tracks", 0) > 0 and random.random() < 0.5:
            # Existing track update
            bearing = state.get("last_bearing", random.choice(BEARINGS))
            bearing = (bearing + random.randint(-15, 15)) % 360
            range_nm = max(5, state.get("last_range_nm", 80) - random.randint(2, 12))
            state["last_bearing"] = bearing
            state["last_range_nm"] = range_nm
            return {
                "event_type": "RADAR_UPDATE",
                "domain": "THREAT",
                "severity": "MEDIUM" if range_nm > 40 else "HIGH",
                "payload": {
                    "message": f"Radar sweep: track update bearing {bearing:03d}, "
                               f"range {range_nm}nm, altitude FL{random.choice([150, 180, 220, 250, 300])}, "
                               f"speed {random.randint(400, 750)} kts.",
                    "bearing": bearing,
                    "range_nm": range_nm,
                    "altitude_fl": random.choice([150, 180, 220, 250, 300]),
                    "tracks": state["active_tracks"],
                },
                "tags": ["radar", "track-update", "sensor"],
            }
        return None

    # New track
    bearing = random.choice(BEARINGS)
    range_nm = random.randint(50, 120)
    altitude_ft = random.choice([15000, 18000, 22000, 25000, 30000, 35000])
    speed_kts = random.randint(350, 800)
    is_hostile = random.random() < cfg.radar_hostile_prob
    iff_status = "invalid" if is_hostile else random.choice(["friendly", "friendly", "unknown"])

    state["active_tracks"] = state.get("active_tracks", 0) + 1
    state["last_bearing"] = bearing
    state["last_range_nm"] = range_nm

    severity = "HIGH" if is_hostile else ("AMBER" if iff_status == "unknown" else "LOW")

    return {
        "event_type": "RADAR_CONTACT",
        "domain": "THREAT",
        "severity": severity,
        "payload": {
            "message": f"Radar contact: new track bearing {bearing:03d}, altitude {altitude_ft}ft, "
                       f"speed {speed_kts}kts, range {range_nm}nm. IFF: {iff_status}.",
            "tracks": state["active_tracks"],
            "bearing": bearing,
            "altitude_ft": altitude_ft,
            "speed_knots": speed_kts,
            "iff": iff_status,
            "range_nm": range_nm,
        },
        "tags": ["radar", "new-contact", "sensor"],
    }


def _gen_fuel_telemetry(cfg: SensorConfig, state: dict) -> dict:
    """Simulate fuel gauge readings."""
    level = state.get("fuel_pct", 85)
    # Drain with noise
    drain = cfg.fuel_drain_rate + random.uniform(-0.2, 0.2)
    level = max(0, level - drain)
    state["fuel_pct"] = level

    flow_rate = round(random.uniform(40, 120), 1)  # L/min
    tank_temp = round(random.uniform(12, 28), 1)

    severity = "CRITICAL" if level < 20 else "HIGH" if level < 35 else "MEDIUM" if level < 60 else "INFO"

    return {
        "event_type": "FUEL_GAUGE",
        "domain": "FUEL",
        "severity": severity,
        "payload": {
            "message": f"Fuel telemetry: main tank {level:.1f}%, "
                       f"flow rate {flow_rate} L/min, tank temp {tank_temp}°C.",
            "fuel_level_pct": round(level, 1),
            "flow_rate_lpm": flow_rate,
            "tank_temp_c": tank_temp,
        },
        "tags": ["fuel-gauge", "telemetry", "sensor"],
    }


def _gen_weather(cfg: SensorConfig, state: dict) -> dict:
    """Simulate weather station update."""
    wx_idx = state.get("weather_idx", 0)
    # Chance of degradation
    if random.random() < cfg.weather_degrade_prob:
        wx_idx = min(wx_idx + 1, len(WEATHER_CONDITIONS) - 1)
    elif random.random() < 0.1 and wx_idx > 0:
        wx_idx = wx_idx - 1
    state["weather_idx"] = wx_idx

    wx = WEATHER_CONDITIONS[wx_idx]
    severity = "INFO" if wx_idx <= 1 else "MEDIUM" if wx_idx == 2 else "HIGH"

    return {
        "event_type": "WEATHER_UPDATE",
        "domain": "SYSTEM",
        "severity": severity,
        "payload": {
            "message": f"Weather station: {wx['condition']}, ceiling {wx['ceiling_ft']}ft, "
                       f"visibility {wx['visibility_km']}km, wind {wx['wind_kts']}kts.",
            **wx,
        },
        "tags": ["weather", "sensor"],
    }


def _gen_ew_scan(cfg: SensorConfig, state: dict) -> Optional[dict]:
    """Simulate EW/SIGINT detection."""
    if random.random() > cfg.ew_jamming_prob:
        return None

    band = random.choice(["X-band", "S-band", "L-band", "UHF", "VHF"])
    bearing = random.choice(BEARINGS)
    strength_dbm = random.randint(-80, -30)
    coverage_deg = round(random.uniform(10, 60), 1)

    return {
        "event_type": "EW_DETECTION",
        "domain": "THREAT",
        "severity": "HIGH",
        "payload": {
            "message": f"EW sensor: {band} emission detected bearing {bearing:03d}, "
                       f"signal strength {strength_dbm}dBm, coverage degradation {coverage_deg}%.",
            "band": band,
            "bearing": bearing,
            "signal_strength_dbm": strength_dbm,
            "coverage_degradation_pct": coverage_deg,
        },
        "tags": ["ew", "sigint", "sensor"],
    }


def _gen_perimeter(cfg: SensorConfig, state: dict) -> Optional[dict]:
    """Simulate perimeter sensor alerts."""
    if random.random() > cfg.perimeter_alert_prob:
        return None

    sector = random.randint(1, 8)
    sensor_type = random.choice(["motion", "acoustic", "seismic", "thermal"])
    confidence = random.choice(["low", "medium", "high"])

    severity = "HIGH" if confidence == "high" else "AMBER" if confidence == "medium" else "LOW"

    return {
        "event_type": "PERIMETER_ALERT",
        "domain": "THREAT",
        "severity": severity,
        "payload": {
            "message": f"Perimeter sensor: {sensor_type} alert in sector {sector}, "
                       f"confidence {confidence}. Possible ground activity.",
            "sector": sector,
            "sensor_type": sensor_type,
            "confidence": confidence,
        },
        "tags": ["perimeter", sensor_type, "sensor"],
    }


# ── Aircraft Telemetry ──────────────────────────────────────────────────────

AIRCRAFT_PHASES = [
    "SHELTER",       # in hardened shelter, cold
    "PRE_FLIGHT",    # crew boarding, systems check
    "FUELING",       # JP-8 being pumped
    "ARMING",        # ordnance loading
    "TAXI",          # moving to runway
    "TAKEOFF",       # rolling / climbing
    "AIRBORNE",      # in flight
    "RTB",           # returning to base
    "LANDING",       # approach / touchdown
    "POST_FLIGHT",   # inspection after recovery
    "MAINTENANCE",   # in maintenance bay
    "GROUNDED",      # unserviceable
]

LOADOUT_CONFIGS = [
    {"type": "air-to-air", "primary": "IRIS-T", "secondary": "AMRAAM", "rounds": "120mm cannon 150rds"},
    {"type": "multirole", "primary": "AMRAAM", "secondary": "GBU-39", "rounds": "120mm cannon 150rds"},
    {"type": "CAS", "primary": "GBU-39", "secondary": "Maverick", "rounds": "120mm cannon 150rds"},
    {"type": "SEAD", "primary": "HARM", "secondary": "AMRAAM", "rounds": "120mm cannon 150rds"},
]

PAD_NAMES = ["Alpha-1", "Alpha-2", "Bravo-1", "Bravo-2", "Charlie-1", "Charlie-2"]


def _init_aircraft_fleet(cfg: SensorConfig, state: dict):
    """Initialize the aircraft fleet state on first call."""
    if "aircraft" in state:
        return

    fleet = {}
    for i in range(1, cfg.aircraft_count + 1):
        ac_id = f"Gripen-{i:02d}"
        loadout = random.choice(LOADOUT_CONFIGS)
        fleet[ac_id] = {
            "id": ac_id,
            "phase": random.choice(["SHELTER", "SHELTER", "SHELTER", "PRE_FLIGHT", "FUELING"]),
            "pad": PAD_NAMES[i - 1] if i <= len(PAD_NAMES) else f"Pad-{i}",
            "fuel_pct": random.randint(40, 95),
            "loadout": loadout["type"],
            "loadout_detail": loadout,
            "pilot": random.choice([f"Pilot-{c}" for c in "ABCDEF"]),
            "hours_since_inspection": round(random.uniform(0, 20), 1),
            "serviceable": True,
            "heading": 0,
            "altitude_ft": 0,
            "speed_kts": 0,
            "flight_time_min": 0,
        }
    state["aircraft"] = fleet
    state["aircraft_last_transition"] = {ac_id: time.time() for ac_id in fleet}


def _gen_aircraft_telemetry(cfg: SensorConfig, state: dict) -> Optional[dict]:
    """Simulate per-aircraft status telemetry. Reports on 1-2 aircraft per tick."""
    _init_aircraft_fleet(cfg, state)
    fleet = state["aircraft"]
    last_t = state["aircraft_last_transition"]
    now = time.time()

    # Pick 1-2 aircraft to update
    ac_ids = random.sample(list(fleet.keys()), min(2, len(fleet)))
    reports = []

    for ac_id in ac_ids:
        ac = fleet[ac_id]
        elapsed = now - last_t[ac_id]

        # Phase transitions based on elapsed time + randomness
        old_phase = ac["phase"]
        new_phase = _advance_phase(ac, elapsed, cfg)

        if new_phase != old_phase:
            ac["phase"] = new_phase
            last_t[ac_id] = now
            _update_aircraft_dynamics(ac)

        # Fuel drain for airborne aircraft
        if ac["phase"] == "AIRBORNE":
            ac["fuel_pct"] = max(5, ac["fuel_pct"] - random.uniform(0.3, 0.8))
            ac["flight_time_min"] += cfg.aircraft_interval / 60
            ac["heading"] = (ac["heading"] + random.randint(-10, 10)) % 360
        elif ac["phase"] == "FUELING":
            ac["fuel_pct"] = min(100, ac["fuel_pct"] + random.uniform(3, 8))

        # Random fault injection
        if ac["serviceable"] and ac["phase"] not in ("AIRBORNE", "TAKEOFF", "LANDING") \
                and random.random() < 0.01:
            ac["serviceable"] = False
            ac["phase"] = "GROUNDED"
            last_t[ac_id] = now
            reports.append(ac)
            continue

        reports.append(ac)

    if not reports:
        return None

    # Build event — report all updated aircraft
    aircraft_data = []
    for ac in reports:
        aircraft_data.append({
            "id": ac["id"],
            "phase": ac["phase"],
            "pad": ac["pad"],
            "fuel_pct": round(ac["fuel_pct"], 1),
            "loadout": ac["loadout"],
            "pilot": ac["pilot"],
            "serviceable": ac["serviceable"],
            "heading": ac["heading"],
            "altitude_ft": ac["altitude_ft"],
            "speed_kts": ac["speed_kts"],
            "flight_time_min": round(ac["flight_time_min"], 1),
            "hours_since_inspection": round(ac["hours_since_inspection"], 1),
        })

    # Summary message
    summaries = []
    for a in aircraft_data:
        if a["phase"] == "AIRBORNE":
            summaries.append(f"{a['id']} airborne hdg {a['heading']:03d} FL{a['altitude_ft']//100} "
                           f"fuel {a['fuel_pct']:.0f}%")
        elif a["phase"] == "GROUNDED":
            summaries.append(f"{a['id']} GROUNDED at {a['pad']} — unserviceable")
        else:
            summaries.append(f"{a['id']} {a['phase']} at {a['pad']} fuel {a['fuel_pct']:.0f}%")

    severity = "INFO"
    for a in aircraft_data:
        if not a["serviceable"]:
            severity = "HIGH"
            break
        if a["fuel_pct"] < 20:
            severity = "AMBER"
        if a["phase"] in ("AIRBORNE", "TAKEOFF", "LANDING") and severity == "INFO":
            severity = "MEDIUM"

    return {
        "event_type": "AIRCRAFT_TELEMETRY",
        "domain": "SORTIE",
        "severity": severity,
        "payload": {
            "message": "Aircraft telemetry: " + "; ".join(summaries),
            "aircraft": aircraft_data,
            "fleet_summary": {
                "total": len(fleet),
                "serviceable": sum(1 for a in fleet.values() if a["serviceable"]),
                "airborne": sum(1 for a in fleet.values() if a["phase"] == "AIRBORNE"),
                "grounded": sum(1 for a in fleet.values() if a["phase"] == "GROUNDED"),
                "fueling": sum(1 for a in fleet.values() if a["phase"] == "FUELING"),
                "arming": sum(1 for a in fleet.values() if a["phase"] == "ARMING"),
                "ready": sum(1 for a in fleet.values()
                            if a["phase"] == "SHELTER" and a["serviceable"] and a["fuel_pct"] > 50),
            },
        },
        "tags": ["aircraft", "telemetry", "sensor"],
    }


def _advance_phase(ac: dict, elapsed: float, cfg: SensorConfig) -> str:
    """State machine for aircraft phase transitions."""
    phase = ac["phase"]
    prob = min(0.4, elapsed / 120)  # higher chance to transition as time passes

    if not ac["serviceable"]:
        return "GROUNDED"

    transitions = {
        "SHELTER":     ["PRE_FLIGHT"],
        "PRE_FLIGHT":  ["FUELING"],
        "FUELING":     ["ARMING"] if ac["fuel_pct"] > 80 else ["FUELING"],
        "ARMING":      ["TAXI"],
        "TAXI":        ["TAKEOFF"],
        "TAKEOFF":     ["AIRBORNE"],
        "AIRBORNE":    ["RTB"] if ac["fuel_pct"] < 25 or ac["flight_time_min"] > 45 else ["AIRBORNE"],
        "RTB":         ["LANDING"],
        "LANDING":     ["POST_FLIGHT"],
        "POST_FLIGHT": ["SHELTER"],
        "MAINTENANCE": ["SHELTER"] if elapsed > 60 else ["MAINTENANCE"],
        "GROUNDED":    ["MAINTENANCE"],
    }

    candidates = transitions.get(phase, [phase])
    if candidates[0] != phase and random.random() < prob:
        next_phase = candidates[0]
        # Reset flight data on landing
        if next_phase == "POST_FLIGHT":
            ac["flight_time_min"] = 0
        return next_phase
    return phase


def _update_aircraft_dynamics(ac: dict):
    """Update speed/altitude based on phase."""
    phase = ac["phase"]
    if phase == "TAKEOFF":
        ac["altitude_ft"] = random.randint(1000, 5000)
        ac["speed_kts"] = random.randint(200, 350)
        ac["heading"] = random.choice([0, 45, 90, 135, 180, 225, 270, 315])
    elif phase == "AIRBORNE":
        ac["altitude_ft"] = random.randint(15000, 35000)
        ac["speed_kts"] = random.randint(400, 700)
    elif phase == "RTB":
        ac["altitude_ft"] = random.randint(5000, 15000)
        ac["speed_kts"] = random.randint(300, 500)
    elif phase == "LANDING":
        ac["altitude_ft"] = random.randint(0, 1000)
        ac["speed_kts"] = random.randint(120, 180)
    else:
        ac["altitude_ft"] = 0
        ac["speed_kts"] = 0


# ── Sensor Simulator (Main Class) ───────────────────────────────────────────

class SensorSimulator:
    """
    Runs mock sensor feeds in a background thread.
    Posts SENSOR-layer events to the bulletin board at configurable intervals.
    """

    def __init__(self, scenario: str = "surge"):
        self.cfg = SensorConfig(scenario)
        self._state: dict = {}  # shared mutable state across generators
        self._alive = False
        self._thread: Optional[threading.Thread] = None

    def start(self):
        self._alive = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="sensor-sim")
        self._thread.start()
        logger.info("Sensor simulator started")

        # Initial weather report
        self._post_sensor(_gen_weather(self.cfg, self._state))

    def stop(self):
        self._alive = False
        logger.info("Sensor simulator stopped")

    def _loop(self):
        """Run sensor feeds at their respective intervals using a tick-based scheduler."""
        schedule = {
            "radar":     {"interval": self.cfg.radar_interval,     "gen": _gen_radar_sweep,        "last": 0},
            "fuel":      {"interval": self.cfg.fuel_interval,      "gen": _gen_fuel_telemetry,     "last": 0},
            "weather":   {"interval": self.cfg.weather_interval,   "gen": _gen_weather,            "last": 0},
            "ew":        {"interval": self.cfg.ew_interval,        "gen": _gen_ew_scan,            "last": 0},
            "perimeter": {"interval": self.cfg.perimeter_interval, "gen": _gen_perimeter,          "last": 0},
            "aircraft":  {"interval": self.cfg.aircraft_interval,  "gen": _gen_aircraft_telemetry, "last": 0},
        }

        while self._alive:
            now = time.time()
            for name, sched in schedule.items():
                if now - sched["last"] >= sched["interval"]:
                    sched["last"] = now
                    try:
                        data = sched["gen"](self.cfg, self._state)
                        if data:
                            self._post_sensor(data)
                    except Exception as e:
                        logger.error(f"Sensor {name} error: {e}")
            time.sleep(1)  # 1s tick resolution

    def _post_sensor(self, data: dict):
        """Post a sensor event to the bulletin board."""
        bulletin.post(
            source=f"SENSOR:{data['event_type']}",
            event_type=data["event_type"],
            domain=data["domain"],
            severity=data["severity"],
            payload=data["payload"],
            tags=data.get("tags", []),
            source_layer="SENSOR",
        )
