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
        self.radar_interval = 20       # seconds between radar sweeps
        self.radar_track_prob = 0.3    # prob of new track per sweep
        self.radar_hostile_prob = 0.15 # prob a new track is hostile

        # Fuel gauges — telemetry interval
        self.fuel_interval = 30
        self.fuel_drain_rate = 0.4     # % per interval (base ops)

        # Weather — update interval
        self.weather_interval = 60
        self.weather_degrade_prob = 0.1

        # EW — electronic warfare detection
        self.ew_interval = 25
        self.ew_jamming_prob = 0.08

        # Perimeter — motion/acoustic sensors
        self.perimeter_interval = 15
        self.perimeter_alert_prob = 0.05

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
            "radar":     {"interval": self.cfg.radar_interval,     "gen": _gen_radar_sweep,  "last": 0},
            "fuel":      {"interval": self.cfg.fuel_interval,      "gen": _gen_fuel_telemetry, "last": 0},
            "weather":   {"interval": self.cfg.weather_interval,   "gen": _gen_weather,      "last": 0},
            "ew":        {"interval": self.cfg.ew_interval,        "gen": _gen_ew_scan,      "last": 0},
            "perimeter": {"interval": self.cfg.perimeter_interval, "gen": _gen_perimeter,    "last": 0},
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
