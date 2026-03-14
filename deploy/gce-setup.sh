#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SABRE — Google Compute Engine deployment script
#
# This script:
#   1. Creates a GCE VM (e2-small, Debian 12)
#   2. Opens firewall for HTTP/HTTPS
#   3. SSHs in, installs Docker, clones the repo, starts the stack
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - A GCP project selected (gcloud config set project YOUR_PROJECT)
#   - A Duck DNS token (https://www.duckdns.org)
#
# Usage:
#   DUCKDNS_TOKEN=xxx GOOGLE_API_KEY=xxx ./gce-setup.sh
#
# Customize these variables as needed:
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────
PROJECT=$(gcloud config get-value project 2>/dev/null)
ZONE="${GCE_ZONE:-europe-north1-a}"              # Stockholm region
MACHINE_TYPE="${GCE_MACHINE:-e2-small}"           # 2 vCPU, 2 GB — plenty for SABRE
INSTANCE_NAME="${GCE_INSTANCE:-sabre-vm}"
DUCKDNS_SUBDOMAIN="${DUCKDNS_SUBDOMAIN:-macs-airbase}"
DOMAIN="${DUCKDNS_SUBDOMAIN}.duckdns.org"
REPO_URL="${REPO_URL:-https://github.com/theorjiugovictor/macs-airbase.git}"
SCENARIO="${SCENARIO:-surge}"

: "${DUCKDNS_TOKEN:?Set DUCKDNS_TOKEN env var}"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  SABRE — GCE Deployment"
echo "═══════════════════════════════════════════════════════════"
echo "  Project  : $PROJECT"
echo "  Zone     : $ZONE"
echo "  Machine  : $MACHINE_TYPE"
echo "  Instance : $INSTANCE_NAME"
echo "  Domain   : $DOMAIN"
echo "  Scenario : $SCENARIO"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── 1. Create firewall rule for HTTP/HTTPS ───────────────────────────────
echo "→ Ensuring firewall rules for HTTP/HTTPS..."
gcloud compute firewall-rules describe allow-http-https >/dev/null 2>&1 || \
gcloud compute firewall-rules create allow-http-https \
    --allow=tcp:80,tcp:443 \
    --target-tags=http-server,https-server \
    --description="Allow HTTP and HTTPS" \
    --direction=INGRESS \
    --priority=1000

# ── 2. Create VM ─────────────────────────────────────────────────────────
echo "→ Creating VM: $INSTANCE_NAME ..."
gcloud compute instances create "$INSTANCE_NAME" \
    --zone="$ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --image-family=debian-12 \
    --image-project=debian-cloud \
    --boot-disk-size=20GB \
    --tags=http-server,https-server \
    --metadata=startup-script='#!/bin/bash
        # Log everything
        exec > /var/log/sabre-setup.log 2>&1
        set -ex

        # Install Docker
        apt-get update -y
        apt-get install -y ca-certificates curl gnupg
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        chmod a+r /etc/apt/keyrings/docker.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
        apt-get update -y
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin git

        # Start Docker
        systemctl enable docker
        systemctl start docker

        echo "Docker installed successfully"
    '

echo "→ Waiting for VM to be ready..."
sleep 30

# ── 3. Get external IP ──────────────────────────────────────────────────
EXTERNAL_IP=$(gcloud compute instances describe "$INSTANCE_NAME" \
    --zone="$ZONE" \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
echo "→ VM external IP: $EXTERNAL_IP"

# ── 4. Update Duck DNS ──────────────────────────────────────────────────
echo "→ Updating Duck DNS: $DOMAIN → $EXTERNAL_IP"
DUCK_RESP=$(curl -s "https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=${EXTERNAL_IP}")
echo "  Duck DNS response: $DUCK_RESP"

# ── 5. Deploy SABRE on the VM ───────────────────────────────────────────
echo "→ Deploying SABRE on the VM..."
gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --command="
    set -ex

    # Wait for startup script to finish installing Docker
    for i in \$(seq 1 60); do
        command -v docker >/dev/null 2>&1 && break
        echo 'Waiting for Docker install...'
        sleep 10
    done

    # Clone repo
    cd /opt
    sudo git clone ${REPO_URL} sabre || (cd /opt/sabre && sudo git pull)
    cd /opt/sabre

    # Write .env
    sudo tee /opt/sabre/deploy/.env > /dev/null <<ENVFILE
DOMAIN=${DOMAIN}
DUCKDNS_TOKEN=${DUCKDNS_TOKEN}
DUCKDNS_SUBDOMAIN=${DUCKDNS_SUBDOMAIN}
OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-}
OPENROUTER_MODEL=${OPENROUTER_MODEL:-google/gemini-2.5-flash}
GOOGLE_API_KEY=${GOOGLE_API_KEY:-}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
SCENARIO=${SCENARIO}
ENVFILE

    # Start the stack
    cd /opt/sabre/deploy
    sudo docker compose -f docker-compose.prod.yml --env-file .env up -d --build

    echo 'SABRE deployed!'
"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ SABRE DEPLOYED"
echo "═══════════════════════════════════════════════════════════"
echo "  WebSocket : wss://${DOMAIN}/ws"
echo "  Health    : https://${DOMAIN}/health"
echo "  VM IP     : $EXTERNAL_IP"
echo "  SSH       : gcloud compute ssh $INSTANCE_NAME --zone=$ZONE"
echo ""
echo "  Connect your Lovable frontend to:"
echo "    wss://${DOMAIN}/ws"
echo "═══════════════════════════════════════════════════════════"
