#!/usr/bin/env bash
set -euo pipefail

ADMIN_CIDR="${1:?Usage: sudo install-single-ec2.sh <trusted-admin-ipv4-cidr>}"
APP_ROOT="${APP_ROOT:-/opt/dynamic-api-gateway}"
CONFIG_DIR=/etc/dynamic-api-gateway
SERVICE_USER=dynamic-gateway

if [[ "$EUID" -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi

if [[ ! "$ADMIN_CIDR" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/([0-9]|[12][0-9]|3[0-2])$ ]]; then
  echo "The trusted administrator CIDR must be an IPv4 CIDR (prefer /32)." >&2
  exit 2
fi
python3 - "$ADMIN_CIDR" <<'PY'
import ipaddress
import sys

try:
    network = ipaddress.ip_network(sys.argv[1], strict=False)
except ValueError as error:
    raise SystemExit(f"Invalid administrator CIDR: {error}")
if network.version != 4 or network.prefixlen < 8:
    raise SystemExit("Administrator CIDR must be IPv4 with prefix length /8 or narrower.")
PY

if [[ ! -f "$APP_ROOT/package.json" || ! -d "$APP_ROOT/.git" ]]; then
  echo "Clone the application repository into $APP_ROOT before running this installer." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get update -y
apt-get install -y nodejs

if ! dpkg-query -W -f='${Status}' mongodb-org-server 2>/dev/null | grep -q 'install ok installed'; then
  install -d -m 0755 /etc/apt/keyrings
  if [[ ! -s /usr/share/keyrings/mongodb-server-8.0.gpg ]]; then
    curl -fsSL https://pgp.mongodb.com/server-8.0.asc \
      | gpg --dearmor --yes -o /usr/share/keyrings/mongodb-server-8.0.gpg
  fi
  if [[ ! -f /etc/apt/sources.list.d/mongodb-org-8.0.list ]]; then
    printf '%s\n' \
      'deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse' \
      > /etc/apt/sources.list.d/mongodb-org-8.0.list
  fi
  apt-get update -y
  apt-get install -y mongodb-org
fi

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/dynamic-gateway \
    --shell /usr/sbin/nologin "$SERVICE_USER"
fi

install -d -m 0750 -o root -g "$SERVICE_USER" "$CONFIG_DIR"
install -d -m 0700 -o "$SERVICE_USER" -g "$SERVICE_USER" \
  /var/lib/dynamic-gateway/keys

GATEWAY_ENV="$CONFIG_DIR/gateway.env"
SERVICES_ENV="$CONFIG_DIR/services.env"

if [[ ! -e "$GATEWAY_ENV" ]]; then
  cat > "$GATEWAY_ENV" <<'EOF'
NODE_ENV=production
PORT=8000
GATEWAY_HOST=127.0.0.1
MONGODB_URI=mongodb://127.0.0.1:27017/dynamic_api_gateway
FRONTEND_URL=http://localhost
USER_SERVICE_URL=http://127.0.0.1:5001
USER_SERVICE_URL_2=http://127.0.0.1:5002
PRODUCT_SERVICE_URL=http://127.0.0.1:5003
ORDER_SERVICE_URL=http://127.0.0.1:5005
PAYMENT_SERVICE_URL=http://127.0.0.1:5007
JWT_ISSUER=dynamic-api-gateway
JWT_AUDIENCE=dynamic-api-gateway
JWT_ALGORITHM=RS256
JWT_ALLOW_LOCAL_JWKS=true
JWT_LOCAL_JWKS_PATH=/var/lib/dynamic-gateway/keys/public.jwks.json
JWT_DEMO_PRIVATE_KEY_PATH=/var/lib/dynamic-gateway/keys/private.pem
JWT_SECRET_REFRESH_INTERVAL_MS=300000
GATEWAY_PROXY_TIMEOUT_MS=10000
BACKEND_HEALTH_CHECK_PATH=/health
BACKEND_HEALTH_CHECK_INTERVAL_MS=5000
BACKEND_HEALTH_CHECK_TIMEOUT_MS=1500
BACKEND_HEALTH_CHECK_FAILURE_THRESHOLD=2
BACKEND_HEALTH_CHECK_RECOVERY_THRESHOLD=1
EOF
  chmod 0640 "$GATEWAY_ENV"
  chown root:"$SERVICE_USER" "$GATEWAY_ENV"
else
  echo "[deployment] Preserving existing $GATEWAY_ENV"
fi

if [[ ! -e "$SERVICES_ENV" ]]; then
  cat > "$SERVICES_ENV" <<'EOF'
NODE_ENV=production
SERVICE_HOST=127.0.0.1
MONGODB_URI=mongodb://127.0.0.1:27017/dynamic_api_gateway
EOF
  chmod 0640 "$SERVICES_ENV"
  chown root:"$SERVICE_USER" "$SERVICES_ENV"
else
  echo "[deployment] Preserving existing $SERVICES_ENV"
fi

PRIVATE_KEY=/var/lib/dynamic-gateway/keys/private.pem
PUBLIC_JWKS=/var/lib/dynamic-gateway/keys/public.jwks.json
if [[ ! -e "$PRIVATE_KEY" && ! -e "$PUBLIC_JWKS" ]]; then
  runuser -u "$SERVICE_USER" -- env \
    JWT_LOCAL_JWKS_PATH="$PUBLIC_JWKS" \
    JWT_DEMO_PRIVATE_KEY_PATH="$PRIVATE_KEY" \
    node \
    "$APP_ROOT/gateway/scripts/generate-dev-jwt-keys.js"
elif [[ -s "$PRIVATE_KEY" && -s "$PUBLIC_JWKS" ]]; then
  echo "[deployment] Preserving existing local JWT key pair."
else
  echo "[deployment] Incomplete JWT key pair exists; refusing to overwrite either key." >&2
  exit 1
fi

if [[ ! -f /etc/mongod.conf ]]; then
  cat > /etc/mongod.conf <<'EOF'
storage:
  dbPath: /var/lib/mongodb
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
net:
  port: 27017
  bindIp: 127.0.0.1
processManagement:
  timeZoneInfo: /usr/share/zoneinfo
EOF
else
  echo "[deployment] Preserving existing /etc/mongod.conf and MongoDB data."
fi

for unit in \
  gateway.service \
  user-service@.service \
  product-service.service \
  order-service.service \
  payment-service.service; do
  install -m 0644 "$APP_ROOT/deployment/systemd/$unit" "/etc/systemd/system/$unit"
done
chmod 0755 "$APP_ROOT"/deployment/scripts/*.sh

sed "s|__ADMIN_CIDR__|$ADMIN_CIDR|g" \
  "$APP_ROOT/deployment/nginx/gateway.conf" \
  > /etc/nginx/sites-available/dynamic-api-gateway
rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/dynamic-api-gateway \
  /etc/nginx/sites-enabled/dynamic-api-gateway

chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_ROOT"
chmod 0755 "$APP_ROOT" "$APP_ROOT/frontend" "$APP_ROOT/gateway"
runuser -u "$SERVICE_USER" -- npm --prefix "$APP_ROOT" ci
runuser -u "$SERVICE_USER" -- env VITE_GATEWAY_BASE_URL=/ \
  npm --prefix "$APP_ROOT" run build:frontend

chmod 0755 "$APP_ROOT/frontend/dist"
nginx -t

systemctl daemon-reload
systemctl enable mongod nginx \
  user-service@5001 user-service@5002 \
  product-service order-service payment-service gateway

systemctl restart mongod
"$APP_ROOT/deployment/scripts/wait-for-mongodb.sh"
systemctl restart \
  user-service@5001 user-service@5002 \
  product-service order-service payment-service
systemctl restart gateway nginx

echo "[deployment] Single-instance application install completed."
echo "[deployment] Data directory preserved: /var/lib/mongodb"
echo "[deployment] Management API access is limited by the Nginx admin CIDR: $ADMIN_CIDR"
