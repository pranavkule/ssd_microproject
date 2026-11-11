#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
UNIT="${2:-}"
APP_ROOT="${APP_ROOT:-/opt/dynamic-api-gateway}"
ALL_UNITS=(
  mongod
  user-service@5001
  user-service@5002
  product-service
  order-service
  payment-service
  gateway
  nginx
)

usage() {
  echo "Usage: sudo $0 <status|health|restart|logs> [unit]" >&2
  echo "Units: ${ALL_UNITS[*]}" >&2
  exit 2
}

if [[ "$EUID" -ne 0 ]]; then
  echo "Run this command with sudo." >&2
  exit 1
fi

case "$ACTION" in
  status)
    systemctl --no-pager --full status "${ALL_UNITS[@]}" || true
    ;;
  health)
    "$APP_ROOT/deployment/scripts/wait-for-mongodb.sh" 5
    for port in 5001 5002 5003 5005 5007; do
      printf 'service %s: ' "$port"
      curl --fail --silent --show-error "http://127.0.0.1:${port}/health"
      echo
    done
    printf 'gateway: '
    curl --fail --silent --show-error http://127.0.0.1:8000/health
    echo
    printf 'nginx: '
    curl --fail --silent --show-error http://127.0.0.1/health
    echo
    ;;
  restart)
    if [[ -n "$UNIT" ]]; then
      systemctl restart "$UNIT"
    else
      systemctl restart mongod
      "$APP_ROOT/deployment/scripts/wait-for-mongodb.sh"
      systemctl restart \
        user-service@5001 user-service@5002 \
        product-service order-service payment-service gateway nginx
    fi
    ;;
  logs)
    if [[ -n "$UNIT" ]]; then
      journalctl --no-pager -n 100 -u "$UNIT"
    else
      journalctl --no-pager -n 50 "${ALL_UNITS[@]}"
    fi
    ;;
  *)
    usage
    ;;
esac
