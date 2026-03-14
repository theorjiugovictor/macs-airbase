"""
Personas — convenience wrapper that exports build_agents as build_macs alias.
main.py imports `from personas import build_macs`.
"""

from agents import build_agents

# Alias so main.py mirrors the MACS import convention
build_macs = build_agents
