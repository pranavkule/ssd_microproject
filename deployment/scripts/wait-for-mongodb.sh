#!/usr/bin/env bash
set -euo pipefail

TIMEOUT_SECONDS="${1:-180}"
DEADLINE=$((SECONDS + TIMEOUT_SECONDS))

while (( SECONDS < DEADLINE )); do
  if mongosh --quiet --host 127.0.0.1 \
    --eval 'quit(db.adminCommand({ ping: 1 }).ok === 1 ? 0 : 1)' \
    >/dev/null 2>&1; then
    echo "[deployment] MongoDB is ready on 127.0.0.1:27017"
    exit 0
  fi
  sleep 2
done

echo "[deployment] MongoDB did not become ready within ${TIMEOUT_SECONDS}s." >&2
exit 1
