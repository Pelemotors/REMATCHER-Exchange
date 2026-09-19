#!/usr/bin/env bash
# Deploy current workspace HEAD to isolated Field Test (:3100 / .next-field-test).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SHA="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"
REF="$(git rev-parse --abbrev-ref HEAD)"
UNIT_DROPIN_DIR="/etc/systemd/system/rematcher-exchange-field-test.service.d"
UNIT_DROPIN="${UNIT_DROPIN_DIR}/git-commit.conf"

echo "=== Deploy Exchange Field Test ==="
echo "SHA: $SHA"

echo "--- prisma migrate deploy (field-test DB) ---"
set -a
# shellcheck disable=SC1091
source "$ROOT/../field-test/.env.field-test"
set +a
npx prisma migrate deploy
npx prisma generate

echo "--- next build (.next-field-test) ---"
export NEXT_DIST_DIR=.next-field-test
NODE_ENV=production npx next build

echo "--- update systemd GIT_COMMIT ---"
mkdir -p "$UNIT_DROPIN_DIR"
cat >"$UNIT_DROPIN" <<EOF
[Service]
Environment=GIT_COMMIT=${SHA}
Environment=GIT_COMMIT_REF=${REF}
EOF
systemctl daemon-reload
systemctl restart rematcher-exchange-field-test.service
sleep 3
systemctl is-active rematcher-exchange-field-test.service

HEALTH="$(curl -sS -m 15 http://127.0.0.1:3100/api/health)"
echo "$HEALTH"
echo "$HEALTH" | grep -q "$SHORT" || echo "$HEALTH" | grep -q "${SHA:0:7}" || {
  echo "WARN: health commit may not match yet"
}

echo "=== Field Test Deploy OK ==="
echo "Live SHA: $SHA"
