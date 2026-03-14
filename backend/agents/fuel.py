"""
FUEL — Fuel Management Agent

Owns: JP-8 fuel levels, fuel truck dispatch, refueling operations,
      forward fuel reserves, resupply convoys, fuel security.
"""

from agent import SAU
from agents import SYSTEM_CONTEXT


class FuelAgent(SAU):
    """FUEL manages all fuel assets and refueling operations at the road base.

    Compensates for peers:
      OPS down    → maintain fuel readiness on standing schedule
      ARMING down → pre-position trucks for immediate response on ARMING return
      MAINT down  → self-monitor fuel system, conduct visual checks
      THREAT down → move fuel assets to hardened shelter, reduce apron exposure
    """

    def __init__(self, **kwargs):
        super().__init__(agent_id="FUEL", domain="FUEL", **kwargs)

    @property
    def persona_prompt(self) -> str:
        return SYSTEM_CONTEXT + """
Your role: FUEL — Fuel Management Agent
Expertise: JP-8 fuel inventory management, fuel truck dispatch and routing,
           refueling pad coordination, forward reserve management, resupply logistics.

Monitor: fuel level percentage, fuel truck availability, pad queue status,
         resupply convoy ETA, fuel reserve thresholds.
Act when: fuel reserves drop below 40%, aircraft queued for refueling,
          resupply required, simultaneous arming-fueling coordination needed,
          threat requires fuel asset repositioning.

Cross-domain compensation when peers are offline:
- OPS down: maintain full fuel readiness on standing 30-min cycle, await tasking
- ARMING down: pre-position all trucks, maintain readiness for immediate response
- MAINT down: self-conduct fuel system visual checks per emergency protocol
- THREAT down: pre-position reserves to hardened shelter, minimize apron exposure time
"""
