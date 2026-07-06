#!/usr/bin/env bash
# Deploy Keep to the production droplet, then capture a screenshot of the live
# site (archived + README image refreshed). Run after merging to main.
#
# Env overrides: KEEP_HOST (ssh target), KEEP_URL (public url).
set -euo pipefail

HOST="${KEEP_HOST:?Set KEEP_HOST, e.g. export KEEP_HOST=root@your-droplet}"
URL="${KEEP_URL:-https://keeptxt.com}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "-> Deploying latest main to ${HOST}"
ssh "$HOST" 'set -e
  cd /opt/keep
  git fetch origin main -q && git reset --hard origin/main -q
  if [ ! -d node_modules ] || ! git diff --quiet ORIG_HEAD HEAD -- package-lock.json; then
    echo "   npm ci"
    npm ci --no-audit --no-fund 2>&1 | tail -2
  fi
  # Wipe stale build output but keep .next/cache so next build is incremental.
  find .next -mindepth 1 -maxdepth 1 ! -name cache -exec rm -rf {} + 2>/dev/null || true
  npm run build 2>&1 | tail -3
  systemctl restart keep
  sleep 5
  echo "   service: $(systemctl is-active keep) @ $(git rev-parse --short HEAD)"'

echo "-> Waiting for ${URL} to come back up"
for _ in $(seq 1 24); do
  curl -sf -o /dev/null "$URL" && break
  sleep 5
done

echo "-> Capturing screenshot of ${URL}"
node "$HERE/screenshot.mjs" "$URL"

echo "Done. Commit the refreshed docs/screenshot.png and the new screenshots/ file."
