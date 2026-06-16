#!/usr/bin/env bash
# Capture a screenshot of the deployed app, archive it under screenshots/, and
# refresh docs/screenshot.png (the image shown in the README) so the latest
# deploy is always reflected and design changes are tracked over time.
#
# Usage: scripts/screenshot.sh [url]
set -euo pipefail

URL="${1:-https://keeptxt.com}"
CHROME="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$ROOT/screenshots/keep-$TS.png"

mkdir -p "$ROOT/screenshots"

if [ ! -x "$CHROME" ]; then
  echo "Chrome not found at: $CHROME (set CHROME_BIN)" >&2
  exit 1
fi

"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1440,900 \
  --screenshot="$ARCHIVE" "$URL" >/dev/null 2>&1

cp "$ARCHIVE" "$ROOT/docs/screenshot.png"
echo "Archived $ARCHIVE and refreshed docs/screenshot.png"
