#!/usr/bin/env bash
# Deploy an explicitly selected, committed local revision to a prepared host.
# See ops/README.md. KEEP_HOST must be an operator SSH target, not the CI user.
set -euo pipefail

: "${KEEP_HOST:?Set KEEP_HOST to the prepared production SSH target}"
[[ $# == 1 ]] || { echo "Usage: $0 <commit>" >&2; exit 64; }
sha=$(git rev-parse --verify "$1^{commit}")
archive=$(mktemp)
trap 'rm -f "$archive"' EXIT
git archive --format=tar "$sha" > "$archive"
ssh "$KEEP_HOST" 'install -d -m 700 /var/lib/keep-incoming'
scp "$archive" "$KEEP_HOST:/var/lib/keep-incoming/$sha.tar"
ssh "$KEEP_HOST" "/usr/local/sbin/keep-build-release $sha /var/lib/keep-incoming/$sha.tar && /usr/local/sbin/keep-activate-release $sha && rm /var/lib/keep-incoming/$sha.tar"
curl --fail --silent --show-error --max-time 20 "${KEEP_URL:-https://keeptxt.com}" > /dev/null
echo "Deployed $sha"
