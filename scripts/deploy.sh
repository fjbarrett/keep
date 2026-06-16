#!/usr/bin/env bash
# Deploy Keep to the production droplet, then capture a screenshot of the live
# site (archived + README image refreshed). Run after merging to main.
#
# Env overrides: KEEP_HOST (ssh target), KEEP_URL (public url).
set -euo pipefail

HOST="${KEEP_HOST:-root@24.199.101.95}"
URL="${KEEP_URL:-https://keeptxt.com}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "-> Deploying latest main to ${HOST}"
ssh "$HOST" 'set -e
  cd /opt/keep
  git fetch origin main -q && git reset --hard origin/main -q
  rm -rf .next
  npm ci --no-audit --no-fund >/dev/null 2>&1
  npm run build >/dev/null 2>&1
  systemctl restart keep
  sleep 5
  echo "   service: $(systemctl is-active keep) @ $(git rev-parse --short HEAD)"'

echo "-> Capturing screenshot of ${URL}"
"$HERE/screenshot.sh" "$URL"

echo "Done. Commit the refreshed docs/screenshot.png and the new screenshots/ file."
