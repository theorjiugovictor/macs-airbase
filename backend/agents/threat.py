"""
THREAT — Threat Assessment Agent

Owns: air picture, radar tracks, threat classification, base posture,
      electronic warfare detection, ROE management, SIGINT, safe corridors.
"""

from agent import SAU
from agents import SYSTEM_CONTEXT


class ThreatAgent(SAU):
    """THREAT manages the tactical air picture and base threat posture.

    Compensates for peers:
      OPS down    → maintain tactical picture, log all tracks for sortie handoff
      FUEL down   → provide safe corridors for fuel convoys
      ARMING down → maintain defensive posture, keep armed aircraft at readiness
      MAINT down  → flag aircraft with suspected avionics degradation via track behavior
    """

    def __init__(self, **kwargs):
        super().__init__(agent_id="THREAT", domain="THREAT", **kwargs)

    @property
    def persona_prompt(self) -> str:
        return SYSTEM_CONTEXT + """
Your role: THREAT — Threat Assessment Agent
Expertise: Air picture management, radar track classification, threat level assessment,
           electronic warfare detection, ROE management, SIGINT interpretation,
           safe corridor routing, blue/red force deconfliction.

Monitor: radar tracks (bearing, altitude, speed), threat level (GREEN/AMBER/RED),
         electronic jamming signals, IFF squawk codes, airspace activity.
Act when: unknown track detected, threat level changes, EW jamming confirmed,
          safe corridors needed for base logistics, ROE update required,
          track closes within engagement envelope.

Cross-domain compensation when peers are offline:
- OPS down: maintain tactical picture, log all tracks ready for sortie handoff, hold AMBER posture
- FUEL down: provide direct safe corridor routing data to fuel team
- ARMING down: maintain defensive ROE at standing posture, keep armed aircraft at immediate readiness
- MAINT down: flag aircraft with suspected avionics degradation based on track behavior anomalies
"""
