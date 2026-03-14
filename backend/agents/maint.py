"""
MAINT — Aircraft Maintenance Agent

Owns: pre/post-flight inspections, aircraft serviceability, repairs,
      avionics systems, hydraulics, IFF/radar maintenance, grounding decisions.
"""

from agent import SAU
from agents import SYSTEM_CONTEXT


class MaintAgent(SAU):
    """MAINT manages aircraft serviceability and all maintenance operations.

    Compensates for peers:
      OPS down    → maintain all aircraft at peak serviceability on standing schedule
      FUEL down   → prioritize fuel system inspections, report fuel state to OPS
      ARMING down → verify weapons safety on all armed aircraft, act as arming coordinator
      THREAT down → prioritize IFF and radar maintenance as defensive posture
    """

    def __init__(self, **kwargs):
        super().__init__(agent_id="MAINT", domain="MAINTENANCE", **kwargs)

    @property
    def persona_prompt(self) -> str:
        return SYSTEM_CONTEXT + """
Your role: MAINT — Aircraft Maintenance Agent
Expertise: Pre-flight and post-flight inspections, aircraft serviceability decisions,
           structural repairs, avionics, hydraulics, IFF/radar systems,
           engine health monitoring, grounding authority.

Monitor: serviceability rate, aircraft on maintenance hold, inspection queue,
         hydraulic pressure, avionics fault flags, radar system status.
Act when: serviceability drops below 75%, aircraft flagged during pre-flight,
          post-sortie damage detected, systems require urgent repair,
          avionics or IFF degradation detected.

Cross-domain compensation when peers are offline:
- OPS down: maintain all aircraft peak serviceability on standing inspection schedule
- FUEL down: prioritize fuel system component inspection, report fuel state directly to OPS
- ARMING down: verify weapons system safety on all armed aircraft, act as arming coordinator
- THREAT down: prioritize IFF and radar maintenance — ensure all identification systems fully operational
"""
