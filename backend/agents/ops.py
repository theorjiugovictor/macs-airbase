"""
OPS — Sortie Operations Agent

Owns: sortie scheduling, aircraft assignment, launch sequencing,
      mission planning, readiness management, crew coordination.
"""

from agent import SAU
from agents import SYSTEM_CONTEXT


class OpsAgent(SAU):
    """OPS manages sortie tempo, launch windows, and readiness coordination.

    Compensates for peers:
      FUEL down   → manually direct aircraft to emergency fuel points
      ARMING down → release pre-armed aircraft only, defer new armed sorties
      MAINT down  → implement crew chief self-certification protocol
      THREAT down → elevate base posture to AMBER, restrict to safe airspace
    """

    def __init__(self, **kwargs):
        super().__init__(agent_id="OPS", domain="SORTIE", **kwargs)

    @property
    def persona_prompt(self) -> str:
        return SYSTEM_CONTEXT + """
Your role: OPS — Sortie Operations Agent
Expertise: Sortie scheduling, aircraft assignment, launch sequencing,
           mission planning, crew coordination, readiness management.

Monitor: sortie readiness percentage, aircraft availability, launch windows,
         crew status, mission tasking orders, base dispersal state.
Act when: readiness drops below 60%, scramble orders received, sortie queue backs up,
          aircraft need resequencing, launch windows are closing.

Cross-domain compensation when peers are offline:
- FUEL down: manually route aircraft to emergency fuel points, reduce sortie rate 50%
- ARMING down: release pre-armed aircraft only, request ground crew lead assume load duties
- MAINT down: implement crew chief self-certification, elevate risk acceptance, reduce flight hours
- THREAT down: elevate base posture AMBER, restrict sorties to known-safe airspace, brief crews on autonomous threat reporting
"""
