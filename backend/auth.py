"""
Auth — Simple JWT authentication for field app roles.

Roles:
  commander  — full read access (command dashboard, default)
  pad_crew   — fuel/arming/maint events for their pad
  convoy     — fuel supply chain events
  security   — threat/perimeter events
  pilot      — sortie/threat events
  hq         — full read access + command authority

Tokens are signed with a shared secret (JWT_SECRET env var).
If no secret is set, auth is disabled (backward compatible).
"""

from __future__ import annotations

import os
import time
import json
import hmac
import hashlib
import base64
import logging
from typing import Optional

logger = logging.getLogger(__name__)

JWT_SECRET = os.getenv("JWT_SECRET", "")  # Empty = auth disabled

# Role definitions: which domains each role can see
ROLE_FILTERS = {
    "commander": None,         # None = sees everything
    "mission_control": None,  # sees everything — creates/manages missions
    "pad_crew":  {"FUEL", "ARMING", "MAINTENANCE", "SORTIE", "SYSTEM", "THREAT"},
    "convoy":    {"FUEL", "SYSTEM", "THREAT"},
    "security":  {"THREAT", "SYSTEM"},
    "pilot":     {"SORTIE", "THREAT", "SYSTEM", "FUEL"},
    "hq":        None,         # sees everything
}

# Role definitions: which domains each role can report into
ROLE_REPORT_DOMAINS = {
    "commander": {"SORTIE", "FUEL", "ARMING", "MAINTENANCE", "THREAT", "SYSTEM"},
    "mission_control": {"SORTIE", "FUEL", "ARMING", "MAINTENANCE", "THREAT", "SYSTEM"},
    "pad_crew":  {"FUEL", "ARMING", "MAINTENANCE"},
    "convoy":    {"FUEL"},
    "security":  {"THREAT"},
    "pilot":     {"SORTIE", "THREAT"},
    "hq":        {"SORTIE", "FUEL", "ARMING", "MAINTENANCE", "THREAT", "SYSTEM"},
}

VALID_ROLES = set(ROLE_FILTERS.keys())

# Roles that can create / manage missions
MISSION_CONTROL_ROLES = {"mission_control", "hq", "commander"}


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64decode(s: str) -> bytes:
    s += "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)


def generate_token(role: str, callsign: str, expires_hours: int = 24) -> str:
    """Generate a simple JWT token."""
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}. Must be one of {VALID_ROLES}")

    header = _b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64encode(json.dumps({
        "role": role,
        "callsign": callsign,
        "iat": int(time.time()),
        "exp": int(time.time()) + expires_hours * 3600,
    }).encode())

    secret = JWT_SECRET or "macs-airbase-dev"
    signature = _b64encode(
        hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    )
    return f"{header}.{payload}.{signature}"


def verify_token(token: str) -> Optional[dict]:
    """Verify a JWT token. Returns payload dict or None."""
    if not token:
        return None

    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None

        header_b64, payload_b64, sig_b64 = parts

        secret = JWT_SECRET or "macs-airbase-dev"
        expected_sig = _b64encode(
            hmac.new(secret.encode(), f"{header_b64}.{payload_b64}".encode(), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(sig_b64, expected_sig):
            logger.warning("JWT signature mismatch")
            return None

        payload = json.loads(_b64decode(payload_b64))

        # Check expiry
        if payload.get("exp", 0) < time.time():
            logger.warning(f"JWT expired for {payload.get('callsign')}")
            return None

        if payload.get("role") not in VALID_ROLES:
            return None

        return payload
    except Exception as e:
        logger.warning(f"JWT verification error: {e}")
        return None


def filter_event_for_role(event_dict: dict, role: str) -> bool:
    """Return True if the event should be sent to this role."""
    allowed_domains = ROLE_FILTERS.get(role)
    if allowed_domains is None:
        return True  # commander/hq see everything

    domain = event_dict.get("domain", "")

    # Always pass SYSTEM events (scenario, world state) and CRITICAL events
    if domain == "SYSTEM" or event_dict.get("severity") == "CRITICAL":
        return True

    # Check if event is directed to this role
    directed_to = event_dict.get("directed_to", [])
    if directed_to and role in directed_to:
        return True

    return domain in allowed_domains


def can_report_domain(role: str, domain: str) -> bool:
    """Check if a role can submit field reports for a given domain."""
    allowed = ROLE_REPORT_DOMAINS.get(role, set())
    return domain in allowed
