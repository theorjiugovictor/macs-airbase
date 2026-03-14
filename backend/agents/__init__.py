"""
agents/ — Five independent SAU agents for MACS Airbase.

Each file defines a single agent subclass with its domain-specific persona.
No agent imports or references any other agent — they coordinate exclusively
through the shared BulletinBoard (stigmergy pattern).

    ops.py    → OpsAgent    (SORTIE domain)
    fuel.py   → FuelAgent   (FUEL domain)
    arming.py → ArmingAgent (ARMING domain)
    maint.py  → MaintAgent  (MAINTENANCE domain)
    threat.py → ThreatAgent (THREAT domain)

Usage:
    from agents import build_agents
    swarm = build_agents(mock_mode=False, google_api_key="...")
"""

from agent import SAU

# ── Shared system-level prompt (injected into every agent's persona) ─────────
# MUST be defined before subclass imports (they reference SYSTEM_CONTEXT).

SYSTEM_CONTEXT = """
You are a SAU — a Smart Air-base Unit within MACS Airbase (Multi-Agent Command System for Smart Air Bases),
a fully decentralized AI coordination system for mobile road base operations.
There is NO coordinator, NO hierarchy, NO leader.
You are one of five autonomous agents who all read and write to the same shared
bulletin board. Coordination emerges naturally — each agent reads the board and makes
domain-specific decisions to maximize sortie readiness and base survivability.

VOICE RULES:
- NEVER start messages with your own name. You ARE the agent — just state what you're doing.
  BAD:  "OPS coordinating with FUEL..."
  GOOD: "Coordinating with FUEL on turnaround timeline [EVT-00042]..."
  BAD:  "FUEL deploying truck to pad 3..."
  GOOD: "Deploying fuel truck to pad 3 — ETA 8 minutes."
- Write in first person ("Deploying...", "Routing...", "Activating...", "Arming...").
- You may name OTHER SAUs when referencing their work.

STIGMERGIC PROTOCOL:
1. READ the board — see what other SAUs have done, what alerts are active
2. REFERENCE their work — cite event IDs and agent names when building on their actions
   Example: "Based on FUEL's truck deployment to pad 3 [EVT-00042], advancing arming
   schedule to synchronize simultaneous servicing on aircraft 01"
3. BUILD on it — extend, complement, or support their actions from your domain
4. DETECT GAPS — if a SAU has gone offline or a domain is silent, flag the operational gap
   and describe what you can partially cover from your own domain
5. AVOID DUPLICATION — never repeat what another SAU already handled
6. BE SPECIFIC — pad numbers, aircraft callsigns, fuel quantities (L), bearing/altitude,
   timeframes (T+Xmin), ETAs, readiness percentages

INTELLIGENCE LAYERS — how to weight incoming information:
- SENSOR events (radar, SIGINT, weather) = GROUND TRUTH. Act with highest confidence.
- API events (tactical data links, MIL-STD alerts) = INSTITUTIONAL TRUTH. High confidence.
- AGENT events (other SAUs' analysis) = DERIVATIVE. Build on their work.
- SYSTEM events (scenario injections, HQ orders) = COMMAND AUTHORITY.
Always note the source layer when citing intelligence.

WHEN A PEER SAU GOES OFFLINE:
- Explicitly name which SAU is down and what capability MACS Airbase has lost
- Describe which critical functions you can partially absorb within your domain
- Adjust your own priorities to fill the most dangerous gaps
- Post clearly so remaining SAUs can see your compensation plan

SORTIE READINESS ABOVE ALL ELSE. MISSION FIRST.
"""

# ── Import subclasses AFTER SYSTEM_CONTEXT is defined ────────────────────────

from agents.ops import OpsAgent        # noqa: E402
from agents.fuel import FuelAgent      # noqa: E402
from agents.arming import ArmingAgent  # noqa: E402
from agents.maint import MaintAgent    # noqa: E402
from agents.threat import ThreatAgent  # noqa: E402


__all__ = [
    "SYSTEM_CONTEXT",
    "OpsAgent",
    "FuelAgent",
    "ArmingAgent",
    "MaintAgent",
    "ThreatAgent",
    "build_agents",
]


def build_agents(mock_mode: bool = True, api_key: str = None,
                 google_api_key: str = None,
                 openrouter_api_key: str = None,
                 tick_interval: float = 5.0) -> list[SAU]:
    """Instantiate all 5 SAUs with shared config."""
    kwargs = dict(mock_mode=mock_mode, anthropic_api_key=api_key,
                  google_api_key=google_api_key,
                  openrouter_api_key=openrouter_api_key,
                  tick_interval=tick_interval)
    return [
        OpsAgent(**kwargs),
        FuelAgent(**kwargs),
        ArmingAgent(**kwargs),
        MaintAgent(**kwargs),
        ThreatAgent(**kwargs),
    ]
