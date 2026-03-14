#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Duck DNS updater — keeps your subdomain pointing at this VM's public IP.
#
# Usage:
#   DUCKDNS_TOKEN=your-token DUCKDNS_SUBDOMAIN=macs-airbase ./duckdns-update.sh
#
# Or install as a cron job (every 5 minutes):
#   */5 * * * * DUCKDNS_TOKEN=xxx DUCKDNS_SUBDOMAIN=macs-airbase /opt/macs-airbase/deploy/duckdns-update.sh >> /var/log/duckdns.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

: "${DUCKDNS_TOKEN:?Set DUCKDNS_TOKEN env var}"
: "${DUCKDNS_SUBDOMAIN:?Set DUCKDNS_SUBDOMAIN env var (just the subdomain, not .duckdns.org)}"

RESPONSE=$(curl -s "https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=")

if [ "$RESPONSE" = "OK" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') Duck DNS updated successfully: ${DUCKDNS_SUBDOMAIN}.duckdns.org"
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: Duck DNS update failed. Response: $RESPONSE" >&2
    exit 1
fi
