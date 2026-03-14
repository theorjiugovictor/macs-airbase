"""
MACS Airbase Integration Tests

Validates core mechanics:
  1. Bulletin board posting, reading, eviction
  2. Scenario injection fires events
  3. Mock agents respond to scenario events within N ticks
  4. Kill/revive lifecycle + gap compensation
  5. World state transitions from events
"""

import time
import threading
import pytest

# ── Helpers ─────────────────────────────────────────────────────────────────

def fresh_bulletin():
    """Return a fresh BulletinBoard (avoids cross-test pollution)."""
    from shared_state import BulletinBoard
    return BulletinBoard()


# ── 1. Bulletin Board ──────────────────────────────────────────────────────

class TestBulletinBoard:

    def test_post_and_read(self):
        bb = fresh_bulletin()
        ev = bb.post("TEST", "PING", "SYSTEM", "INFO", {"message": "hello"})
        assert ev.id == "EVT-00001"
        assert len(bb.read_all()) == 1

    def test_read_since(self):
        bb = fresh_bulletin()
        e1 = bb.post("A", "T", "D", "INFO", {})
        e2 = bb.post("B", "T", "D", "INFO", {})
        e3 = bb.post("C", "T", "D", "INFO", {})
        since = bb.read_since(e1.id)
        assert [e.id for e in since] == [e2.id, e3.id]

    def test_eviction(self):
        bb = fresh_bulletin()
        bb.MAX_EVENTS = 5  # low cap for test
        for i in range(10):
            bb.post("SRC", "T", "D", "INFO", {"i": i})
        assert len(bb.read_all()) == 5
        # The oldest events should be gone; newest should remain
        ids = [e.id for e in bb.read_all()]
        assert "EVT-00001" not in ids
        assert "EVT-00010" in ids

    def test_stats(self):
        bb = fresh_bulletin()
        bb.post("A", "T", "FUEL", "HIGH", {})
        bb.post("B", "T", "SORTIE", "LOW", {})
        bb.post("C", "T", "FUEL", "HIGH", {})
        stats = bb.stats()
        assert stats["total_events"] == 3
        assert stats["by_domain"]["FUEL"] == 2
        assert stats["by_severity"]["HIGH"] == 2

    def test_agent_status_tracking(self):
        bb = fresh_bulletin()
        bb.post("OPS", "AGENT_ONLINE", "SORTIE", "INFO", {})
        bb.post("OPS", "AGENT_OFFLINE", "SORTIE", "INFO", {})
        status = bb.agent_status()
        assert status["OPS"] == "offline"

    def test_subscribe(self):
        bb = fresh_bulletin()
        received = []
        bb.subscribe(lambda e: received.append(e))
        bb.post("X", "T", "D", "INFO", {"msg": "hi"})
        assert len(received) == 1
        assert received[0].source == "X"

    def test_source_mode_field(self):
        bb = fresh_bulletin()
        ev = bb.post("OPS", "ACTION_TAKEN", "SORTIE", "HIGH", {"message": "test"},
                      source_mode="mock")
        assert ev.source_mode == "mock"
        ev2 = bb.post("OPS", "ACTION_TAKEN", "SORTIE", "HIGH", {"message": "test2"},
                       source_mode="gemini")
        assert ev2.source_mode == "gemini"


# ── 2. Scenario Injection ─────────────────────────────────────────────────

class TestScenarioRunner:

    def test_list_scenarios(self):
        from scenarios import ScenarioRunner
        scenarios = ScenarioRunner.list_scenarios()
        keys = [s["key"] for s in scenarios]
        assert "surge" in keys
        assert "scramble" in keys
        assert "disperse" in keys

    def test_scenario_fires_events(self):
        """Surge scenario should inject events into the bulletin within 2 seconds."""
        from shared_state import BulletinBoard, Event
        import shared_state

        # Temporarily swap out the global bulletin with a fresh one
        original = shared_state.bulletin
        test_bb = BulletinBoard()
        shared_state.bulletin = test_bb

        try:
            # Re-import after swap so ScenarioRunner picks up the new bulletin
            import importlib
            import scenarios as sc_mod
            importlib.reload(sc_mod)

            runner = sc_mod.ScenarioRunner("surge")
            runner.start()
            time.sleep(2.5)  # first event has delay=0, should fire immediately
            runner.stop()

            events = test_bb.read_all()
            # Should have at least the scenario start + first event
            assert len(events) >= 1, f"Expected events, got {len(events)}"
            types = [e.event_type for e in events]
            assert "SCENARIO_START" in types or "TASKING_ORDER" in types
        finally:
            shared_state.bulletin = original


# ── 3. Mock Agent Responds ─────────────────────────────────────────────────

class TestMockAgent:

    def test_agent_posts_actions(self):
        """A mock agent should post at least one ACTION_TAKEN within a few ticks."""
        from agents.ops import OpsAgent
        from shared_state import bulletin

        # Inject a scenario event so OPS has something to react to
        bulletin.post("SYSTEM", "TASKING_ORDER", "SORTIE", "HIGH",
                       {"message": "HQ tasking: 4 sorties required.", "sorties_required": 4})

        initial_count = len(bulletin.read_all())
        agent = OpsAgent(mock_mode=True, tick_interval=0.5)
        agent.start()

        # Wait for several ticks (agent has jitter ±40% on 0.5s = 0.3-0.7s)
        time.sleep(6)
        agent.stop()
        time.sleep(0.5)

        new_events = bulletin.read_all()[initial_count:]
        action_events = [e for e in new_events
                         if e.event_type == "ACTION_TAKEN" and e.source == "OPS"]
        assert len(action_events) >= 1, (
            f"OPS should have acted at least once, got {len(action_events)} actions"
        )

    def test_gap_compensation(self):
        """When an agent goes offline, peers should detect the gap and compensate."""
        from agents.fuel import FuelAgent
        from shared_state import bulletin

        # Simulate OPS going offline
        bulletin.post("OPS", "AGENT_ONLINE", "SORTIE", "INFO",
                       {"message": "OPS online"})
        bulletin.post("OPS", "AGENT_OFFLINE", "SORTIE", "INFO",
                       {"message": "OPS going offline"})

        initial_count = len(bulletin.read_all())
        fuel = FuelAgent(mock_mode=True, tick_interval=1.0)
        fuel.start()
        time.sleep(5)
        fuel.stop()
        time.sleep(0.5)

        new_events = bulletin.read_all()[initial_count:]
        fuel_actions = [e for e in new_events
                        if e.source == "FUEL" and e.event_type == "ACTION_TAKEN"]
        # At least one action should reference compensating for OPS
        compensating = [e for e in fuel_actions
                        if "OPS" in e.payload.get("message", "")
                        or e.payload.get("details", {}).get("compensating_for") == "OPS"]
        assert len(compensating) >= 1, (
            f"FUEL should compensate for OPS offline. Actions: "
            f"{[e.payload.get('message', '')[:60] for e in fuel_actions]}"
        )

    def test_mock_actions_tagged_as_mock(self):
        """Mock agent actions should carry source_mode='mock'."""
        from agents.arming import ArmingAgent
        from shared_state import bulletin

        initial_count = len(bulletin.read_all())
        agent = ArmingAgent(mock_mode=True, tick_interval=1.0)
        agent.start()
        time.sleep(4)
        agent.stop()
        time.sleep(0.5)

        new_events = bulletin.read_all()[initial_count:]
        actions = [e for e in new_events
                   if e.event_type == "ACTION_TAKEN" and e.source == "ARMING"]
        for a in actions:
            assert a.source_mode == "mock", (
                f"Expected source_mode='mock', got '{a.source_mode}'"
            )


# ── 4. World State Transitions ────────────────────────────────────────────

class TestWorldState:

    def test_fuel_low_updates_state(self):
        from world_state import WorldStateManager
        from shared_state import Event

        mgr = WorldStateManager("surge")
        ev = Event(
            id="EVT-TEST-1", timestamp=time.time(), source="SYSTEM",
            event_type="FUEL_LOW", domain="FUEL", severity="HIGH",
            payload={"fuel_level_pct": 38, "trucks_available": 1, "resupply_eta_hours": 4},
        )
        mgr.observe(ev)
        snap = mgr.snapshot()
        assert snap["fuel"]["level_pct"] == 38
        assert snap["fuel"]["trucks_available"] == 1

    def test_aircraft_grounded(self):
        from world_state import WorldStateManager
        from shared_state import Event

        mgr = WorldStateManager("surge")
        before_svc = mgr.state.aircraft_serviceable
        ev = Event(
            id="EVT-TEST-2", timestamp=time.time(), source="SYSTEM",
            event_type="AIRCRAFT_GROUNDED", domain="MAINTENANCE", severity="HIGH",
            payload={"aircraft_id": "Gripen-04", "fault": "hydraulic"},
        )
        mgr.observe(ev)
        assert mgr.state.aircraft_grounded == 1
        assert mgr.state.aircraft_serviceable == before_svc - 1

    def test_action_taken_fuel_keywords(self):
        """ACTION_TAKEN with fuel keywords should bump fuel level."""
        from world_state import WorldStateManager
        from shared_state import Event

        mgr = WorldStateManager("surge")
        mgr.state.fuel_level_pct = 50
        ev = Event(
            id="EVT-TEST-3", timestamp=time.time(), source="FUEL",
            event_type="ACTION_TAKEN", domain="FUEL", severity="HIGH",
            payload={"message": "Deploying fuel truck Alpha to dispersal pad 3. JP-8 delivery in progress."},
        )
        mgr.observe(ev)
        assert mgr.state.fuel_level_pct == 55  # +5 from keyword match

    def test_threat_action_text_does_not_silently_downgrade_to_green(self):
        """Free-form THREAT ACTION_TAKEN text should not silently downgrade the world state."""
        from world_state import WorldStateManager
        from shared_state import Event

        mgr = WorldStateManager("surge")
        mgr.state.threat_level = "RED"
        mgr.state.radar_tracks = 2
        ev = Event(
            id="EVT-TEST-4", timestamp=time.time(), source="THREAT",
            event_type="ACTION_TAKEN", domain="THREAT", severity="LOW",
            payload={"message": "Track confirmed friendly — blue force exercise. Threat downgraded to GREEN."},
        )
        mgr.observe(ev)
        assert mgr.state.threat_level == "RED"
        assert mgr.state.radar_tracks == 2

    def test_threat_resolved_event_downgrades_world_state(self):
        """Explicit THREAT_RESOLVED events should downgrade the world state."""
        from world_state import WorldStateManager
        from shared_state import Event

        mgr = WorldStateManager("surge")
        mgr.state.threat_level = "RED"
        mgr.state.radar_tracks = 2
        ev = Event(
            id="EVT-TEST-4A", timestamp=time.time(), source="SYSTEM",
            event_type="THREAT_RESOLVED", domain="THREAT", severity="LOW",
            payload={"message": "Threat resolved.", "threat_level": "GREEN"},
        )
        mgr.observe(ev)
        assert mgr.state.threat_level == "GREEN"
        assert mgr.state.radar_tracks == 0

    def test_critical_threat_event_escalates_world_state_without_payload_level(self):
        """Critical THREAT events should escalate world-state even without payload.threat_level."""
        from world_state import WorldStateManager
        from shared_state import Event

        mgr = WorldStateManager("surge")
        mgr.state.threat_level = "GREEN"
        ev = Event(
            id="EVT-TEST-4B", timestamp=time.time(), source="SENSOR",
            event_type="RADAR_CONTACT", domain="THREAT", severity="CRITICAL",
            payload={"message": "Inbound hostile track detected.", "tracks": 1},
        )
        mgr.observe(ev)
        assert mgr.state.threat_level == "RED"
        assert mgr.state.radar_tracks == 1

    def test_high_threat_event_escalates_world_state_to_amber_without_payload_level(self):
        """High THREAT events should escalate to AMBER when no explicit threat level is present."""
        from world_state import WorldStateManager
        from shared_state import Event

        mgr = WorldStateManager("surge")
        mgr.state.threat_level = "GREEN"
        ev = Event(
            id="EVT-TEST-4C", timestamp=time.time(), source="SENSOR",
            event_type="RADAR_CONTACT", domain="THREAT", severity="HIGH",
            payload={"message": "Unknown fast mover detected.", "tracks": 1},
        )
        mgr.observe(ev)
        assert mgr.state.threat_level == "AMBER"

    def test_clamp_prevents_overflow(self):
        from world_state import WorldStateManager

        mgr = WorldStateManager("surge")
        mgr.state.fuel_level_pct = 200
        mgr.state.aircraft_serviceable = -5
        mgr._clamp()
        assert mgr.state.fuel_level_pct == 100
        assert mgr.state.aircraft_serviceable == 0

    def test_aircraft_telemetry_populates_registry(self):
        """AIRCRAFT_TELEMETRY sensor events should populate per-aircraft state."""
        from world_state import WorldStateManager
        from shared_state import Event

        mgr = WorldStateManager("surge")
        ac_data = [
            {"id": "Gripen-01", "phase": "AIRBORNE", "pad": "Alpha-1",
             "fuel_pct": 72.5, "loadout": "air-to-air", "pilot": "Pilot-A",
             "serviceable": True, "heading": 90, "altitude_ft": 25000,
             "speed_kts": 600, "flight_time_min": 12.0, "hours_since_inspection": 3.5},
            {"id": "Gripen-02", "phase": "SHELTER", "pad": "Alpha-2",
             "fuel_pct": 95.0, "loadout": "multirole", "pilot": "Pilot-B",
             "serviceable": True, "heading": 0, "altitude_ft": 0,
             "speed_kts": 0, "flight_time_min": 0, "hours_since_inspection": 1.2},
            {"id": "Gripen-03", "phase": "GROUNDED", "pad": "Bravo-1",
             "fuel_pct": 50.0, "loadout": "CAS", "pilot": "Pilot-C",
             "serviceable": False, "heading": 0, "altitude_ft": 0,
             "speed_kts": 0, "flight_time_min": 0, "hours_since_inspection": 18.0},
        ]
        ev = Event(
            id="EVT-AC-1", timestamp=time.time(), source="SENSOR",
            event_type="AIRCRAFT_TELEMETRY", domain="SORTIE", severity="INFO",
            source_layer="SENSOR",
            payload={"message": "Aircraft telemetry", "aircraft": ac_data},
        )
        mgr.observe(ev)

        assert len(mgr.state.aircraft_registry) == 3
        assert mgr.state.aircraft_registry["Gripen-01"]["phase"] == "AIRBORNE"
        assert mgr.state.aircraft_registry["Gripen-03"]["serviceable"] is False

        # Aggregate counts should be derived from registry (>=3 aircraft)
        assert mgr.state.aircraft_airborne == 1
        assert mgr.state.aircraft_grounded == 1
        assert mgr.state.aircraft_serviceable == 2

        # Snapshot should include per-aircraft data
        snap = mgr.snapshot()
        assert "Gripen-01" in snap["aircraft"]
        assert snap["aircraft"]["Gripen-01"]["altitude_ft"] == 25000

    def test_sensor_generates_aircraft_telemetry(self):
        """SensorSimulator's aircraft generator should produce valid telemetry."""
        from sensors import SensorConfig, _gen_aircraft_telemetry

        cfg = SensorConfig("surge")
        state = {}
        result = _gen_aircraft_telemetry(cfg, state)

        assert result is not None
        assert result["event_type"] == "AIRCRAFT_TELEMETRY"
        assert result["domain"] == "SORTIE"
        assert "aircraft" in result["payload"]
        assert "fleet_summary" in result["payload"]
        assert len(result["payload"]["aircraft"]) >= 1

        ac = result["payload"]["aircraft"][0]
        assert "id" in ac
        assert "phase" in ac
        assert "fuel_pct" in ac
        assert "loadout" in ac


# ── Run ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
