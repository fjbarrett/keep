#!/usr/bin/env bash
# Capture a screenshot of the iOS app on a simulator — the mobile analog of
# scripts/screenshot.sh. Generates the Xcode project, builds for the simulator,
# boots it, launches the app, and grabs a screenshot. Archives under
# ios/screenshots/ and refreshes ios/docs/screenshot.png (the image shown in
# ios/README.md), so design changes are tracked over time.
#
# The iOS client has no native auth yet (see ios/README.md), so against an
# unreachable/unauthed backend it renders its empty state — that's expected for
# now; the point is to track the UI shell as it evolves.
#
# Requirements: Xcode + xcodegen + jq (all present on GitHub macOS runners).
# Env overrides:
#   IOS_SIM_NAME       pin a specific simulator (default: first available iPhone)
#   IOS_SHOT_ARCHIVE   "0" to skip the timestamped archive (CI sets this so the
#                      repo isn't bloated with one PNG per merge)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IOS="$ROOT/ios"
TS="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$IOS/screenshots/keep-ios-$TS.png"
DOCS="$IOS/docs/screenshot.png"
DERIVED="$IOS/build"
BUNDLE_ID="com.keeptxt.keep"

command -v xcodegen >/dev/null || { echo "xcodegen not found (brew install xcodegen)" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq not found (brew install jq)" >&2; exit 1; }

echo "-> Generating Xcode project"
( cd "$IOS" && xcodegen generate >/dev/null )

echo "-> Building Keep for the simulator"
xcodebuild \
  -project "$IOS/Keep.xcodeproj" \
  -scheme Keep \
  -sdk iphonesimulator \
  -configuration Debug \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  build >/dev/null

APP="$DERIVED/Build/Products/Debug-iphonesimulator/Keep.app"
[ -d "$APP" ] || { echo "build product not found at $APP" >&2; exit 1; }

# Pick a simulator: an explicit IOS_SIM_NAME, else the first available iPhone
# (device names drift across Xcode versions, so resolve dynamically).
if [ -n "${IOS_SIM_NAME:-}" ]; then
  UDID=$(xcrun simctl list devices available -j \
    | jq -r --arg n "$IOS_SIM_NAME" '[.devices[][] | select(.name==$n)][0].udid // empty')
else
  UDID=$(xcrun simctl list devices available -j \
    | jq -r '[.devices[][] | select(.name | startswith("iPhone"))][0].udid // empty')
fi
[ -n "$UDID" ] || { echo "no available iPhone simulator found" >&2; exit 1; }
echo "-> Using simulator $UDID"

cleanup() { xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

xcrun simctl boot "$UDID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
xcrun simctl install "$UDID" "$APP" >/dev/null
xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null

# Let the first frame settle (the API load fails fast against no backend).
sleep 6

mkdir -p "$IOS/docs"
if [ "${IOS_SHOT_ARCHIVE:-1}" = "0" ]; then
  xcrun simctl io "$UDID" screenshot "$DOCS" >/dev/null
  echo "Refreshed $DOCS"
else
  mkdir -p "$IOS/screenshots"
  xcrun simctl io "$UDID" screenshot "$ARCHIVE" >/dev/null
  cp "$ARCHIVE" "$DOCS"
  echo "Archived $ARCHIVE and refreshed $DOCS"
fi
