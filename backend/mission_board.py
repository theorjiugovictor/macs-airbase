"""
Mission Board — Active mission store for MACS Airbase.

Missions are standing orders that persist until expired or cancelled.
They are injected into every agent's reasoning context so agents
factor them into every decision.
"""

import threading
import time
import logging
from dataclasses import dataclass, field, asdict
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class Mission:
    id: str
    name: str
    description: str = ""
    status: str = "active"          # active | expired | cancelled
    domain: Optional[str] = None    # SORTIE, FUEL, ARMING, MAINTENANCE, THREAT, or None (all)
    priority: str = "HIGH"          # CRITICAL, HIGH, MEDIUM
    start_time: float = 0.0
    duration_min: Optional[float] = None
    created_by: str = ""
    parameters: dict = field(default_factory=dict)


class MissionBoard:
    """Thread-safe active mission store with auto-expiry."""

    def __init__(self):
        self._missions: dict[str, Mission] = {}
        self._lock = threading.Lock()
        self._expiry_thread: Optional[threading.Thread] = None
        self._running = False
        self._counter = 0

    # ── CRUD ──────────────────────────────────────────────────────────────

    def create(self, *, name: str, description: str = "",
               domain: Optional[str] = None, priority: str = "HIGH",
               duration_min: float = 60, created_by: str = "",
               parameters: dict = None) -> Mission:
        with self._lock:
            self._counter += 1
            mid = f"m_{int(time.time())}_{self._counter:03d}"
            m = Mission(
                id=mid, name=name, description=description,
                status="active", domain=domain, priority=priority,
                start_time=time.time(), duration_min=duration_min,
                created_by=created_by, parameters=parameters or {},
            )
            self._missions[mid] = m

        logger.info(f"Mission CREATED: {mid} — {name} [{priority}] ({domain or 'ALL'})")
        self._post_event("MISSION_ACTIVE", m)
        return m

    def update(self, mission_id: str, *, updated_by: str = "", **kwargs) -> Optional[Mission]:
        with self._lock:
            m = self._missions.get(mission_id)
            if not m or m.status != "active":
                return None
            for k, v in kwargs.items():
                if hasattr(m, k):
                    setattr(m, k, v)

        logger.info(f"Mission UPDATED: {mission_id} by {updated_by}")
        self._post_event("MISSION_UPDATED", m)
        return m

    def cancel(self, mission_id: str, *, cancelled_by: str = "",
               reason: str = "") -> Optional[Mission]:
        with self._lock:
            m = self._missions.get(mission_id)
            if not m or m.status != "active":
                return None
            m.status = "cancelled"

        logger.info(f"Mission CANCELLED: {mission_id} by {cancelled_by} — {reason}")
        self._post_event("MISSION_CANCELLED", m, extra={"cancelled_by": cancelled_by, "reason": reason})
        return m

    def get_active(self) -> list[Mission]:
        with self._lock:
            return [m for m in self._missions.values() if m.status == "active"]

    def snapshot(self) -> list[dict]:
        with self._lock:
            return [asdict(m) for m in self._missions.values() if m.status == "active"]

    def all_missions(self) -> list[dict]:
        with self._lock:
            return [asdict(m) for m in self._missions.values()]

    # ── Auto-expiry ───────────────────────────────────────────────────────

    def start(self):
        self._running = True
        self._expiry_thread = threading.Thread(target=self._expiry_loop, daemon=True)
        self._expiry_thread.start()
        logger.info("MissionBoard started (expiry thread active)")

    def stop(self):
        self._running = False
        if self._expiry_thread:
            self._expiry_thread.join(timeout=5)

    def _expiry_loop(self):
        while self._running:
            now = time.time()
            expired = []
            with self._lock:
                for m in self._missions.values():
                    if m.status == "active" and m.duration_min:
                        elapsed = (now - m.start_time) / 60
                        if elapsed >= m.duration_min:
                            m.status = "expired"
                            expired.append(m)
            for m in expired:
                logger.info(f"Mission EXPIRED: {m.id} — {m.name}")
                self._post_event("MISSION_EXPIRED", m)
            time.sleep(10)

    # ── Bulletin integration ──────────────────────────────────────────────

    def _post_event(self, event_type: str, mission: Mission, extra: dict = None):
        try:
            from shared_state import bulletin
            payload = {"mission": asdict(mission), "mission_id": mission.id,
                       "mission_name": mission.name}
            if extra:
                payload.update(extra)
            bulletin.post(
                source="MISSION_CONTROL",
                event_type=event_type,
                domain=mission.domain or "SYSTEM",
                severity=mission.priority if event_type == "MISSION_ACTIVE" else "MEDIUM",
                payload=payload,
                tags=["mission", "pinned"],
                source_layer="COMMAND",
            )
        except Exception as e:
            logger.error(f"Failed to post mission event: {e}")


# Singleton
mission_board = MissionBoard()
