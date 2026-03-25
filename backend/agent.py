"""
SAU (Smart Air-base Unit) — Base Agent Class

Each SAU runs an independent perceive → reason → act loop in its own thread.
Agents NEVER communicate directly. All coordination happens through the shared
BulletinBoard (shared_state.py) — this is the stigmergy pattern.

Loop:
  1. PERCEIVE  — read bulletin board since last tick
  2. REASON    — LLM (Gemini/Claude) decides whether to act, or mock fallback
  3. ACT       — post decision back to bulletin board

Subclasses: see agents/ directory
  agents/ops.py    → OpsAgent    (SORTIE)
  agents/fuel.py   → FuelAgent   (FUEL)
  agents/arming.py → ArmingAgent (ARMING)
  agents/maint.py  → MaintAgent  (MAINTENANCE)
  agents/threat.py → ThreatAgent (THREAT)
"""

from __future__ import annotations

import time
import random
import threading
import json
import logging
import os
from abc import ABC, abstractmethod
from dataclasses import asdict
from typing import Optional

from shared_state import bulletin, Event

logger = logging.getLogger(__name__)

# ── Try importing LLM SDKs; fall back gracefully ─────────────────────────────
try:
    import anthropic
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _ANTHROPIC_AVAILABLE = False

try:
    from google import genai as google_genai
    from google.genai import types as google_types
    _GOOGLE_AVAILABLE = True
except ImportError:
    _GOOGLE_AVAILABLE = False

try:
    from openai import OpenAI as _OpenAI
    _OPENAI_AVAILABLE = True
except ImportError:
    _OPENAI_AVAILABLE = False


GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash")


MOCK_RESPONSES = {
    "OPS": [
        "Sortie surge underway. Assigning aircraft to 3 concurrent launch slots. Coordinating with FUEL and ARMING for 30-minute turnaround on slots 1 and 2.",
        "Readiness at 62%. Two aircraft cleared for immediate tasking. Third needs MAINT sign-off — releasing 01 and 02 now. Slot 3 follows in 25 minutes.",
        "Scramble order received. Fast-tracking Gripen pair from dispersal point Alpha. Requesting updated THREAT picture for intercept heading.",
    ],
    "FUEL": [
        "Fuel truck Alpha deploying to dispersal pad 3. Aircraft needs 4,200 L JP-8 for full combat load. ETA 8 minutes to pad.",
        "Forward fuel reserves at 67%. Requesting resupply convoy from main base. Estimated 6-hour window before operational fuel limit reached.",
        "Refueling complete on slot 1. Truck 2 in position on slot 2. Compressed turnaround — coordinating simultaneous service window with ARMING.",
    ],
    "ARMING": [
        "Ordnance team at dispersal pad 2. Loading IRIS-T air-to-air configuration. Estimated 18 minutes to combat-ready on aircraft 01.",
        "Arming complete on aircraft 01. Weapons systems checked and safe. Releasing to OPS for crew brief and launch authorization.",
        "Reconfiguring aircraft 03 from CAS to air defense role — swapping GBU for AMRAAM. MAINT inspection required post-swap before release.",
    ],
    "MAINT": [
        "Aircraft 02 hydraulics flagged — minor pressure drop on port system. Grounding for inspection. ETA to cleared status: 25 minutes.",
        "Pre-flight inspections complete on 3 aircraft. All systems nominal. Serviceability rate 80%. Three airframes available for tasking.",
        "Post-sortie inspection on aircraft 04 complete. Bird strike damage to leading edge confirmed. Repair time 4 hours. OPS notified — slot reallocated.",
    ],
    "THREAT": [
        "Radar track confirmed: fast mover bearing 340, altitude FL180, closing at 680 knots. Classifying as unknown. Elevating base posture to AMBER.",
        "Electronic jamming detected on primary comms band — likely EW asset 90km north. All units switch to backup frequency. MAINT: verify IFF systems.",
        "Track bearing 340 confirmed friendly — blue force exercise. Threat level downgraded to GREEN. Resuming normal sortie ops.",
    ],
}

# Cross-agent reactive responses: keyed by (agent_id, triggering_domain).
REACTIVE_RESPONSES = {
    "OPS": {
        "FUEL": [
            "Fuel confirmed for slots 1 and 2. Launching sortie pair on schedule. Adjusting window to align with FUEL ETA on slot 3.",
            "Refueling timeline integrated. 3-ship formation ready T+20min per FUEL clearance — crews to aircraft.",
        ],
        "ARMING": [
            "Weapons load confirmed on aircraft 01. Crew brief complete. Clearing for launch — 5-minute window. Handoff to FUEL for final fuel check.",
            "Arming complete per ARMING report. Revising sortie sequence — armed aircraft launching first to maximize time on task.",
        ],
        "MAINTENANCE": [
            "MAINT flagged 25-minute delay on aircraft 02. Revising launch — 01 and 03 lead. Maintaining 2-ship minimum for mission.",
            "Serviceability confirmed by MAINT. Activating full 3-aircraft sortie plan. Alert crews manning positions now.",
        ],
        "THREAT": [
            "THREAT elevation to AMBER noted. Repositioning aircraft to hardened dispersal pads. Scramble crews at 15-minute readiness.",
            "AMBER picture received. Coordinating with THREAT on intercept geometry. Assigning dedicated CAP pair — ROE confirmed.",
        ],
    },
    "FUEL": {
        "SORTIE": [
            "OPS sortie surge confirmed. Pre-positioning all 3 fuel trucks at designated pads. Synchronized with 30-min turnaround timeline.",
            "Scramble order noted. Emergency fuel priority on pad Alpha — bypassing scheduled sequence. Truck 1 departing now.",
        ],
        "ARMING": [
            "Coordinating with ARMING — simultaneous fueling and arming approved for 01 and 03. Safety separation maintained, officer on site.",
            "Post-arming reconfig noted. Fuel truck repositioning to pad 2 for slot 3 alignment with ARMING.",
        ],
        "MAINTENANCE": [
            "MAINT hold on aircraft 02 acknowledged. Redirecting fuel resources to 01 and 03. Reserve staged for 02 on clearance.",
            "Serviceability confirmed by MAINT. All fuel trucks positioned and ready. Awaiting OPS launch clearance.",
        ],
        "THREAT": [
            "AMBER threat noted. Pre-positioning emergency tanker at alternate dispersal site. Fuel assets moved off exposed apron.",
            "THREAT elevation confirmed. Routing fuel convoy via low-threat corridor — bearing 180 through checkpoint Bravo.",
        ],
    },
    "ARMING": {
        "SORTIE": [
            "OPS launch window confirmed. Ordnance teams advancing schedule — completing load in 15 minutes vice 18. Prioritizing aircraft 01.",
            "Scramble order received. Fast-tracking IRIS-T load — non-essential checks deferred. Weapons ready in 10 minutes.",
        ],
        "FUEL": [
            "Fuel truck in position. Beginning simultaneous arming and fueling per OPS authorization. Safety officer standing by.",
            "Post-fuel systems check completed alongside arming. Aircraft 01 fully combat-configured — releasing to OPS.",
        ],
        "MAINTENANCE": [
            "MAINT cleared aircraft 03. Arming team deploying immediately — ordnance ready within 20 minutes.",
            "Post-sortie MAINT inspection complete. Reconfiguring weapons load for next mission profile per OPS tasking order.",
        ],
        "THREAT": [
            "THREAT alert received. Switching aircraft 02 to air defense load — AMRAAM priority over CAS configuration.",
            "Threat level AMBER: verifying all IFF codes per arming checklist. Coordinating with THREAT on weapon release authority.",
        ],
    },
    "MAINT": {
        "SORTIE": [
            "OPS sortie schedule received. Pre-sortie inspections accelerated. Prioritizing aircraft 01 and 02 for earliest launch.",
            "Scramble order noted. Releasing aircraft 01 on emergency authorization — post-flight inspection deferred. Risk accepted by crew.",
        ],
        "FUEL": [
            "Refueling in progress. Running parallel systems checks to compress turnaround. Avionics and hydraulics clear on 01.",
            "Fuel complete on aircraft 03. Running final avionics check now. Estimated ready in 12 minutes.",
        ],
        "ARMING": [
            "Arming team on aircraft 02. Conducting maintenance checks outside ordnance safety zone — not interfering with load.",
            "Post-arming inspection complete on 02. All systems nominal. Releasing to OPS.",
        ],
        "THREAT": [
            "THREAT alert: inspecting all IFF and avionics as precaution. EW jamming event triggers full comms-suite check across fleet.",
            "AMBER threat: grounding aircraft 03 — degraded radar. Prioritizing air intercept system repair. ETA 90 minutes.",
        ],
    },
    "THREAT": {
        "SORTIE": [
            "OPS scramble noted. Providing updated tactical picture — track bearing 340 is primary intercept target. ROE GREEN for engagement.",
            "Sortie airborne. Feeding real-time targeting data. THREAT monitoring for course changes and new tracks.",
        ],
        "FUEL": [
            "Fuel convoy noted. Routing resupply through low-threat corridor — bearing 180 via checkpoint Bravo. Clear of all radar tracks.",
            "Fuel trucks repositioned to alternate site confirmed. Area is clear of current threat vector.",
        ],
        "ARMING": [
            "Arming load complete. Confirming weapon release authority with ground command. THREAT picture supports engagement parameters.",
            "Air defense reconfiguration noted. Track bearing 340 within intercept envelope — ROE updated for current loadout.",
        ],
        "MAINTENANCE": [
            "MAINT IFF check noted. Confirming all blue force callsigns verified — no fratricide risk in current picture.",
            "Degraded radar on aircraft confirmed. Maintaining full THREAT coverage for remaining airframes. Continuous assessment active.",
        ],
    },
}

# Gap-detection responses: when an agent detects a peer is offline.
GAP_RESPONSES = {
    "OPS": {
        "FUEL": "FUEL offline — fuel truck coordination lost. Manually directing aircraft to emergency fuel point Delta. Sortie rate reduced 50% until FUEL restored. Conserving fuel for highest-priority tasking only.",
        "ARMING": "ARMING offline — weapons loading halted. Releasing only pre-armed aircraft. New armed sortie requests deferred. Requesting ground crew lead assume basic ordnance duties with available load team.",
        "MAINT": "MAINT offline — aircraft serviceability unmonitored. Implementing self-certification: crew chiefs conducting pre-flight checks per standing orders. Risk elevated — reducing flight hours accordingly.",
        "THREAT": "THREAT offline — tactical picture lost. Elevating base posture to AMBER as precaution. Restricting sorties to known-safe airspace. All crews briefed on autonomous threat reporting protocol.",
    },
    "FUEL": {
        "OPS": "OPS offline — sortie sequencing lost. Maintaining fuel readiness on all pads per standing schedule. Fuel trucks cycling every 30 minutes until tasking is restored.",
        "ARMING": "ARMING offline — weapons-fuel coordination degraded. Maintaining full fuel readiness. Pre-positioning all trucks for immediate response once ARMING capability is restored.",
        "MAINT": "MAINT offline — fuel system inspections now self-monitored. Ground crew conducting visual fuel system checks per emergency protocol. No critical fuel failures reported.",
        "THREAT": "THREAT offline — threat picture lost. Moving fuel reserves to hardened shelter. Reducing exposed time of all fuel trucks on open apron until threat picture is restored.",
    },
    "ARMING": {
        "OPS": "OPS offline — launch schedule unknown. Maintaining armed standby on 2 aircraft. Suspending new ordnance loads pending sortie tasking — conserving weapons load integrity.",
        "FUEL": "FUEL offline — fueling coordination degraded. Continuing weapons loads on aircraft currently at pad. Team briefed to clear ordnance zone before any fuel activity resumes.",
        "MAINT": "MAINT offline — post-arming inspections self-conducted. Arming team leads performing basic aircraft systems check alongside weapons verification.",
        "THREAT": "THREAT offline — loading default air defense configuration on standby aircraft. Maintaining maximum-range intercept loadout as precaution until threat picture is restored.",
    },
    "MAINT": {
        "OPS": "OPS offline — no sortie schedule visible. Maintaining all aircraft at peak serviceability. Cycling inspection teams across all airframes on standing maintenance schedule.",
        "FUEL": "FUEL offline — fuel system checks now priority maintenance task. Inspecting all fuel system components and aircraft tanks. Reporting fuel state directly to OPS on restoration.",
        "ARMING": "ARMING offline — verifying weapons system safety on all armed aircraft. Ensuring safe storage configuration until ARMING returns. Weapons safety officer now acting as arming coordinator.",
        "THREAT": "THREAT offline — prioritizing IFF and radar system maintenance. Ensuring all aircraft communications and identification systems fully operational as defensive posture.",
    },
    "THREAT": {
        "OPS": "OPS offline — maintaining tactical picture independently. All tracks logged and ready for immediate sortie handoff. AMBER posture maintained — no aircraft should sortie without THREAT clearance.",
        "FUEL": "FUEL offline — providing direct safe corridor data to fuel team. Routing fuel convoy through low-threat bearing 180 until FUEL situational awareness is restored.",
        "ARMING": "ARMING offline — maintaining air defense ROE at standing defensive posture. All remaining armed aircraft at immediate readiness per current THREAT assessment.",
        "MAINT": "MAINT offline — THREAT flagging aircraft with suspected avionics degradation based on track behavior anomalies. Feeding data to OPS for maintenance prioritization.",
    },
}


class SAU(ABC):
    """
    Base class for a SAU (Smart Air-base Unit).
    Subclasses override `persona_prompt` and optionally `mock_reason`.
    """

    def __init__(
        self,
        agent_id: str,
        domain: str,
        tick_interval: float = 12.0,
        mock_mode: bool = False,
        anthropic_api_key: str = None,
        google_api_key: str = None,
        openrouter_api_key: str = None,
    ):
        self.agent_id = agent_id
        self.domain = domain
        self.tick_interval = tick_interval
        self.mock_mode = mock_mode
        self._alive = False
        self._thread: threading.Thread = None
        self._last_event_id: str = None
        self._tick_count = 0
        self._mock_response_index = 0
        self._last_act_time = 0.0
        self._consecutive_idle = 0
        self._client  = None  # Anthropic
        self._gclient = None  # Gemini
        self._orclient = None  # OpenRouter (OpenAI-compatible)
        self._last_reasoning: dict = {}  # last reasoning context for transparency

        if not mock_mode:
            # Initialize ALL available clients — fallback chain uses them in order
            if google_api_key and _GOOGLE_AVAILABLE:
                self._gclient = google_genai.Client(api_key=google_api_key)
                logger.info(f"[{agent_id}] Gemini available (model: {GEMINI_MODEL})")
            if openrouter_api_key and _OPENAI_AVAILABLE:
                self._orclient = _OpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=openrouter_api_key,
                )
                logger.info(f"[{agent_id}] OpenRouter available (model: {OPENROUTER_MODEL})")
            if anthropic_api_key and _ANTHROPIC_AVAILABLE:
                self._client = anthropic.Anthropic(api_key=anthropic_api_key)
                logger.info(f"[{agent_id}] Claude available")

    # ── Abstract interface ───────────────────────────────────────────────────

    @property
    def last_reasoning(self) -> dict:
        """Return last reasoning context for transparency API."""
        return self._last_reasoning

    @property
    @abstractmethod
    def persona_prompt(self) -> str:
        """System prompt defining this agent's role and expertise."""

    # ── Lifecycle ────────────────────────────────────────────────────────────

    def start(self):
        self._alive = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name=self.agent_id)
        self._thread.start()
        bulletin.post(
            source=self.agent_id,
            event_type="AGENT_ONLINE",
            domain=self.domain,
            severity="INFO",
            source_layer="AGENT",
            payload={"message": f"{self.agent_id} online and monitoring."},
            tags=["lifecycle"],
        )
        logger.info(f"[{self.agent_id}] started")

    def stop(self):
        self._alive = False
        bulletin.post(
            source=self.agent_id,
            event_type="AGENT_OFFLINE",
            domain=self.domain,
            severity="INFO",
            source_layer="AGENT",
            payload={"message": f"{self.agent_id} going offline."},
            tags=["lifecycle"],
        )
        logger.info(f"[{self.agent_id}] stopped")

    def is_alive(self) -> bool:
        return self._alive and self._thread is not None and self._thread.is_alive()

    # ── Main loop ────────────────────────────────────────────────────────────

    def _loop(self):
        while self._alive:
            try:
                self._tick()
            except Exception as e:
                logger.error(f"[{self.agent_id}] tick error: {e}")
            # Jitter ±40% so agents don't fire in synchronized bursts
            jitter = self.tick_interval * random.uniform(0.6, 1.4)
            time.sleep(jitter)

    def _tick(self):
        self._tick_count += 1
        now = time.time()

        # 1. PERCEIVE — read new events
        new_events = bulletin.read_since(self._last_event_id)
        if new_events:
            self._last_event_id = new_events[-1].id

        # 2. REASON — should I act?
        relevant = self._filter_relevant(new_events)

        # Skip if nothing relevant and not time for a periodic check.
        idle_period = 6 + min(self._consecutive_idle, 12)  # 6-18 ticks
        if not relevant and self._tick_count % idle_period != 0:
            self._consecutive_idle += 1
            return

        # Per-agent cooldown: don't act again within 10s of last action.
        since_last = now - self._last_act_time
        if since_last < 10.0:
            has_system_crisis = any(
                e.source == "SYSTEM" and e.severity in ("CRITICAL", "HIGH")
                or e.event_type == "AGENT_OFFLINE"
                for e in relevant
            )
            if not has_system_crisis:
                return

        context = self._build_context()
        decision = self._reason(context, relevant)

        if decision and decision.get("action"):
            self._act(decision, relevant_events=relevant, context_snapshot=context)
            self._last_act_time = time.time()
            self._consecutive_idle = 0
        else:
            self._consecutive_idle += 1

    def _filter_relevant(self, events: list[Event]) -> list[Event]:
        """Keep events that are actionable for this domain."""
        if not events:
            return []
        skip_types = {"AGENT_ONLINE"}  # Keep AGENT_OFFLINE for gap detection
        return [
            e for e in events
            if e.event_type not in skip_types and (
                e.domain == self.domain
                or e.severity in ("CRITICAL", "HIGH")
                or e.source == "SYSTEM"
                or e.source_layer == "SENSOR"      # ground truth — always relevant
                or e.event_type == "FIELD_REPORT"   # human intelligence
                or e.event_type == "AGENT_OFFLINE"
                or e.event_type == "ACTION_TAKEN"
                or e.event_type == "AGENT_COMPENSATION"
                or e.source == "MISSION_CONTROL"   # standing orders
            )
        ]

    def _build_context(self) -> str:
        """Construct the situational awareness snapshot passed to the LLM."""
        snapshot = bulletin.snapshot(max_events=30)
        stats = bulletin.stats()
        agent_status = bulletin.agent_status()
        domain_activity = bulletin.domain_last_active()
        now = time.time()

        # Active missions from mission board
        try:
            from mission_board import mission_board
            active_missions = mission_board.snapshot()
        except Exception:
            active_missions = []

        return json.dumps({
            "agent_id": self.agent_id,
            "domain": self.domain,
            "bulletin_summary": stats,
            "sau_status": agent_status,
            "seconds_since_last_action": {
                k: round(now - v) for k, v in domain_activity.items()
            },
            "active_missions": active_missions,
            "recent_events": snapshot,
        }, indent=2)

    def _reason(self, context: str, relevant_events: list) -> Optional[dict]:
        """Route through fallback chain: Gemini → OpenRouter → Claude → mock."""
        result = None
        provider = "mock"

        # Try Gemini first
        if self._gclient:
            result = self._gemini_reason(context, relevant_events)
            if result is not None:
                provider = "gemini"

        # Try OpenRouter
        if result is None and self._orclient:
            result = self._openrouter_reason(context, relevant_events)
            if result is not None:
                provider = "openrouter"

        # Try Claude
        if result is None and self._client:
            result = self._claude_reason(context, relevant_events)
            if result is not None:
                provider = "claude"

        # Final fallback: mock
        if result is None:
            result = self._mock_reason(relevant_events)
            provider = "mock"

        # Tag the result with actual provider used
        if result:
            result["_provider"] = provider

        # Capture reasoning context for transparency
        self._last_reasoning = {
            "timestamp": time.time(),
            "agent_id": self.agent_id,
            "input_event_ids": [e.id for e in relevant_events] if relevant_events else [],
            "input_event_summaries": [
                {"id": e.id, "type": e.event_type, "source": e.source,
                 "domain": e.domain, "severity": e.severity,
                 "message": e.payload.get("message", "")[:120]}
                for e in (relevant_events or [])
            ][:10],
            "decision": result,
            "acted": bool(result and result.get("action")),
        }
        return result

    def _build_user_prompt(self, context: str, relevant_events: list) -> str:
        agent_status = bulletin.agent_status()
        domain_activity = bulletin.domain_last_active()
        now = time.time()

        online = [k for k, v in agent_status.items() if v == "online" and k != self.agent_id]
        offline = [k for k, v in agent_status.items() if v == "offline" and k != self.agent_id]

        silent = []
        for aid, ts in domain_activity.items():
            if aid != self.agent_id and (now - ts) > 45:
                silent.append("{} (silent {}s)".format(aid, int(now - ts)))

        other_actions = []
        for e in reversed(relevant_events):
            if e.source != self.agent_id and e.event_type == "ACTION_TAKEN":
                other_actions.append(
                    "  [{}] {}: {}".format(e.id, e.source, e.payload.get("message", "")[:150])
                )
        other_actions = other_actions[:6]

        relevant_summary = json.dumps(
            [{"id": e.id, "type": e.event_type, "source": e.source, "domain": e.domain,
              "severity": e.severity, "payload": e.payload} for e in relevant_events],
            indent=2,
        )

        actions_block = "\n".join(other_actions) if other_actions else "  (none yet)"

        # Active missions section
        missions_block = ""
        try:
            from mission_board import mission_board
            active = mission_board.get_active()
            if active:
                lines = ["ACTIVE MISSIONS (standing orders \u2014 factor these into EVERY decision):"]
                now = time.time()
                for m in active:
                    remaining = ""
                    if m.duration_min:
                        left = max(0, m.duration_min - (now - m.start_time) / 60)
                        remaining = f" [{int(left)}min remaining]"
                    lines.append(f"  \u2022 [{m.priority}] {m.name}: {m.description} (domain: {m.domain or 'ALL'}){remaining}")
                missions_block = "\n".join(lines) + "\n\n"
        except Exception:
            pass

        team_section = (
            "TEAM STATUS:\n"
            "  Units online: " + (", ".join(online) if online else "none visible") + "\n"
            "  Units offline: " + (", ".join(offline) if offline else "none") + "\n"
            "  Silent domains: " + (", ".join(silent) if silent else "none") + "\n\n"
            "RECENT PEER ACTIONS (reference these by event ID when building on them):\n"
            + actions_block
        )

        return f"""Current situation (shared bulletin board state):
{context}

{missions_block}{team_section}

New events since last tick:
{relevant_summary}

Based on the situation above, decide your next action for domain {self.domain}.

IMPORTANT:
- NEVER start your message with your own agent name — just describe what you're doing
- If a SAU has gone OFFLINE or is silent, acknowledge the gap and describe compensation
- Reference specific event IDs (e.g. EVT-00042) when building on another SAU's work
- Be specific: pad numbers, fuel quantities, aircraft callsigns, ETAs, headings
- Don't duplicate what another SAU already handled

Respond with JSON:
If acting:
{{
  "action": true,
  "event_type": "ACTION_TAKEN",
  "severity": "HIGH|MEDIUM|LOW",
  "message": "what you are doing (reference other SAUs, sensor data, and event IDs)",
  "references": ["EVT-XXXXX"],
  "directed_to": ["pad_crew", "convoy", "security", "pilot"],
  "details": {{}}
}}
If compensating for a downed SAU:
{{
  "action": true,
  "event_type": "AGENT_COMPENSATION",
  "severity": "HIGH",
  "message": "what you are doing to cover the offline SAU's responsibilities",
  "references": ["EVT-XXXXX"],
  "details": {{"compensating_for": "SAU_NAME", "compensation_type": "gap_coverage"}}
}}
The "directed_to" field is OPTIONAL — include it when your action is relevant to
specific field roles (pad_crew, convoy, security, pilot, hq). This sends your
action directly to their mobile devices.
If no action needed:
{{
  "action": false
}}
Respond ONLY with valid JSON. No markdown."""

    def _gemini_reason(self, context: str, relevant_events: list) -> Optional[dict]:
        """Reason using Gemini. Returns None on failure so the fallback chain continues."""
        user_prompt = self._build_user_prompt(context, relevant_events)
        try:
            response = self._gclient.models.generate_content(
                model=GEMINI_MODEL,
                contents=user_prompt,
                config=google_types.GenerateContentConfig(
                    system_instruction=self.persona_prompt,
                    response_mime_type="application/json",
                    max_output_tokens=500,
                ),
            )
            return json.loads(response.text)
        except Exception as e:
            logger.warning(f"[{self.agent_id}] Gemini error: {e} — trying next in chain")
            return None

    def _openrouter_reason(self, context: str, relevant_events: list) -> Optional[dict]:
        """Reason using OpenRouter (OpenAI-compatible API). Returns None on failure."""
        user_prompt = self._build_user_prompt(context, relevant_events)
        try:
            response = self._orclient.chat.completions.create(
                model=OPENROUTER_MODEL,
                max_tokens=500,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": self.persona_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                extra_headers={
                    "HTTP-Referer": "https://macs-airbase.duckdns.org",
                    "X-Title": "MACS Airbase",
                },
            )
            text = response.choices[0].message.content.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text)
        except Exception as e:
            logger.warning(f"[{self.agent_id}] OpenRouter error: {e} — trying next in chain")
            return None

    def _claude_reason(self, context: str, relevant_events: list) -> Optional[dict]:
        """Reason using Claude (Anthropic). Returns None on failure."""
        user_prompt = self._build_user_prompt(context, relevant_events)
        try:
            response = self._client.messages.create(
                model="claude-opus-4-6",
                max_tokens=400,
                system=self.persona_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            text = response.content[0].text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text)
        except Exception as e:
            logger.warning(f"[{self.agent_id}] Claude error: {e} — trying next in chain")
            return None

    def _mock_reason(self, relevant_events: list = None) -> Optional[dict]:
        """Return a context-aware scripted response for demo/testing.

        Priority order:
        1. Gap detection — compensate for offline peers
        2. Reactive — respond to other SAUs' actions
        3. Default — cyclic domain responses
        """
        if relevant_events:
            # 1. GAP DETECTION — compensate for offline peers
            for e in relevant_events:
                if e.event_type == "AGENT_OFFLINE" and e.source != self.agent_id:
                    gaps = GAP_RESPONSES.get(self.agent_id, {})
                    gap_msg = gaps.get(e.source)
                    if gap_msg:
                        self._mock_response_index += 1
                        return {
                            "action": True,
                            "event_type": "AGENT_COMPENSATION",
                            "severity": "HIGH",
                            "message": gap_msg,
                            "details": {
                                "mock": True,
                                "compensating_for": e.source,
                                "compensation_type": "gap_coverage",
                            },
                            "references": [e.id],
                        }

            # 2. REACTIVE — respond to other SAUs' recent actions
            seen = set()
            candidates = []
            for e in reversed(relevant_events):
                if (e.source != self.agent_id
                        and e.event_type == "ACTION_TAKEN"
                        and e.domain not in seen):
                    seen.add(e.domain)
                    candidates.append((e.domain, e.id))

            reactions = REACTIVE_RESPONSES.get(self.agent_id, {})
            for domain, ref_id in candidates:
                options = reactions.get(domain)
                if options:
                    msg = options[self._mock_response_index % len(options)]
                    self._mock_response_index += 1
                    return {
                        "action": True,
                        "event_type": "ACTION_TAKEN",
                        "severity": "HIGH",
                        "message": msg,
                        "details": {"mock": True, "reacting_to": domain},
                        "references": [ref_id],
                    }

        # 3. Fall back to default cyclic responses
        responses = MOCK_RESPONSES.get(self.agent_id, [])
        if not responses:
            return None
        msg = responses[self._mock_response_index % len(responses)]
        self._mock_response_index += 1
        return {
            "action": True,
            "event_type": "ACTION_TAKEN",
            "severity": "HIGH",
            "message": msg,
            "details": {"mock": True},
        }

    def _act(self, decision: dict, relevant_events: list = None, context_snapshot: str = None):
        """Post the decision to the bulletin board with full reasoning context."""
        if not decision.get("action"):
            return

        payload = {
            "message": decision.get("message", ""),
            "details": decision.get("details", {}),
        }
        refs = decision.get("references", [])
        if refs:
            payload["references"] = refs

        # Use the actual provider that produced this decision
        mode = decision.pop("_provider", "mock")

        # ── Reasoning transparency: attach what triggered this decision ──
        reasoning_ctx = {
            "mode": mode,
            "trigger_event_ids": [e.id for e in (relevant_events or [])],
            "trigger_summaries": [
                {"id": e.id, "type": e.event_type, "source": e.source,
                 "domain": e.domain, "message": e.payload.get("message", "")[:100]}
                for e in (relevant_events or [])
            ][:8],
        }
        # Include active missions that influenced the decision
        try:
            from mission_board import mission_board
            active = mission_board.get_active()
            if active:
                reasoning_ctx["active_missions"] = [
                    {"id": m.id, "name": m.name, "priority": m.priority,
                     "domain": m.domain or "ALL"}
                    for m in active
                ][:5]
        except Exception:
            pass
        payload["reasoning_context"] = reasoning_ctx

        # Directed actions — tell specific field roles about this
        directed_to = decision.get("directed_to", [])

        bulletin.post(
            source=self.agent_id,
            event_type=decision.get("event_type", "ACTION_TAKEN"),
            domain=self.domain,
            severity=decision.get("severity", "MEDIUM"),
            source_layer="AGENT",
            source_mode=mode,
            directed_to=directed_to,
            payload=payload,
            tags=[self.domain.lower(), "action"],
        )
        logger.info(f"[{self.agent_id}] acted: {decision.get('message', '')[:80]}")
