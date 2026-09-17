#!/usr/bin/env bash
# Deploy current workspace HEAD to exchange.rematcher.co.il (self-hosted :3200).
# Usage: ./scripts/deploy-exchange-production.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SHA="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"
REF="$(git rev-parse --abbrev-ref HEAD)"
ROLLBACK_SHA="$(systemctl show rematcher-exchange-production.service -p Environment --value | tr ' ' '\n' | sed -n 's/^GIT_COMMIT=//p' | head -1 || true)"
UNIT_DROPIN_DIR="/etc/systemd/system/rematcher-exchange-production.service.d"
UNIT_DROPIN="${UNIT_DROPIN_DIR}/git-commit.conf"

echo "=== Deploy Exchange Production ==="
echo "SHA: $SHA"
echo "REF: $REF"
echo "Previous GIT_COMMIT: ${ROLLBACK_SHA:-unknown}"

echo "--- typecheck ---"
NODE_ENV=development npx tsc --noEmit

echo "--- tests ---"
NODE_ENV=development npm test

echo "--- prisma migrate deploy (production DB) ---"
set -a
# shellcheck disable=SC1091
source "$ROOT/.env.production"
set +a
npx prisma migrate deploy
npx prisma generate

echo "--- next build ---"
unset NEXT_DIST_DIR
NODE_ENV=production npx next build

echo "--- update systemd GIT_COMMIT ---"
mkdir -p "$UNIT_DROPIN_DIR"
cat >"$UNIT_DROPIN" <<EOF
[Service]
Environment=GIT_COMMIT=${SHA}
Environment=GIT_COMMIT_REF=${REF}
EOF
systemctl daemon-reload
systemctl restart rematcher-exchange-production.service
sleep 3
systemctl is-active rematcher-exchange-production.service

echo "--- smoke ---"
HEALTH="$(curl -sS -m 15 http://127.0.0.1:3200/api/health)"
echo "$HEALTH"
echo "$HEALTH" | grep -q "$SHORT" || echo "$HEALTH" | grep -q "${SHA:0:7}" || {
  echo "WARN: health commit may not match yet: $HEALTH"
}
LOGIN_CODE="$(curl -sS -m 15 -o /tmp/ex-login.html -w '%{http_code}' https://exchange.rematcher.co.il/login)"
CSS="$(rg -o '/_next/static/css/[^\" ]+\.css' /tmp/ex-login.html | head -1 || true)"
CSS_CODE="none"
if [ -n "$CSS" ]; then
  CSS_CODE="$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "https://exchange.rematcher.co.il${CSS}")"
fi
R_CODE="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' https://exchange.rematcher.co.il/brand/rematcher-r-gold.svg)"
echo "login_http=$LOGIN_CODE css=$CSS css_http=$CSS_CODE r_gold=$R_CODE"

if [ "$LOGIN_CODE" != "200" ] || [ "$CSS_CODE" != "200" ]; then
  echo "SMOKE FAILED — consider rollback to $ROLLBACK_SHA"
  exit 1
fi

echo "=== Deploy OK ==="
echo "Live SHA: $SHA"
echo "Rollback SHA: ${ROLLBACK_SHA:-none}"
