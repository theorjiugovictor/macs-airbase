#!/usr/bin/env bash
# MACS Airbase — GCE VM management script
# Usage:
#   ./deploy/vm.sh start    — Start VM + deploy latest code
#   ./deploy/vm.sh stop     — Stop VM (preserves disk, no compute cost)
#   ./deploy/vm.sh deploy   — Pull latest & rebuild on running VM
#   ./deploy/vm.sh logs     — Tail backend logs
#   ./deploy/vm.sh status   — Check VM status + health endpoint

PROJECT="macs-489321"
ZONE="europe-north1-a"
VM="sabre-vm"
DOMAIN="macs-airbase.duckdns.org"

ssh_cmd() {
  gcloud compute ssh "$VM" --zone="$ZONE" --project="$PROJECT" --command="$1"
}

case "${1:-status}" in
  start)
    echo "▶ Starting VM..."
    gcloud compute instances start "$VM" --zone="$ZONE" --project="$PROJECT"
    echo "⏳ Waiting 20s for boot..."
    sleep 20
    echo "🚀 Deploying latest code..."
    ssh_cmd "cd /opt/sabre && sudo git pull origin main && sudo docker compose -f deploy/docker-compose.prod.yml up -d --build"
    echo "✅ VM running. https://$DOMAIN/field"
    ;;
  stop)
    echo "⏹ Stopping VM (disk preserved, no compute charges)..."
    gcloud compute instances stop "$VM" --zone="$ZONE" --project="$PROJECT"
    echo "✅ VM stopped. Run './deploy/vm.sh start' to resume."
    ;;
  deploy)
    echo "🚀 Deploying latest code..."
    ssh_cmd "cd /opt/sabre && sudo git pull origin main && sudo docker compose -f deploy/docker-compose.prod.yml up -d --build"
    echo "✅ Deployed. https://$DOMAIN/field"
    ;;
  logs)
    ssh_cmd "cd /opt/sabre && sudo docker compose -f deploy/docker-compose.prod.yml logs --tail=50 backend"
    ;;
  status)
    echo "VM status:"
    gcloud compute instances describe "$VM" --zone="$ZONE" --project="$PROJECT" --format="value(status)"
    echo ""
    echo "Health check:"
    ssh_cmd "curl -s http://localhost:8080/health" 2>/dev/null || echo "(VM not reachable)"
    ;;
  *)
    echo "Usage: $0 {start|stop|deploy|logs|status}"
    exit 1
    ;;
esac
