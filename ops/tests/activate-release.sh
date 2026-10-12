#!/usr/bin/env bash
# Exercise activation failure paths in a private fixture; no real services run.
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/bin" "$fixture/keep/releases"
old=1111111111111111111111111111111111111111
new=2222222222222222222222222222222222222222
for sha in "$old" "$new"; do
  mkdir -p "$fixture/keep/releases/$sha"
  printf '%s\n' "$sha" > "$fixture/keep/releases/$sha/RELEASE"
done
# Only paths and the root precondition change; the activation logic is original.
sed -e "s|/opt/keep|$fixture/keep|g" \
    -e "s|/run/keep-activate.lock|$fixture/activate.lock|g" \
    -e 's/$EUID == 0 \&\& //' "$root/ops/activate-release" > "$fixture/activate"
cat > "$fixture/bin/systemctl" <<'MOCK'
#!/bin/bash
printf '%s\n' "$*" >> "$KEEP_TEST_EVENTS"
MOCK
cp "$fixture/bin/systemctl" "$fixture/bin/systemd-run"
printf '#!/bin/sh\nexit 0\n' > "$fixture/bin/sleep"
cat > "$fixture/bin/curl" <<'MOCK'
#!/bin/bash
url=${!#}
if [[ $KEEP_TEST_SCENARIO == candidate-fails && $url == *:3001/* ]] ||
   [[ $KEEP_TEST_SCENARIO == rollback && $url == *:3000/* && $(readlink "$KEEP_TEST_ROOT/current") == "$KEEP_TEST_ROOT/releases/$KEEP_TEST_NEW" ]]; then
  printf 500
elif [[ $url == */api/notes ]]; then printf 401
elif [[ $url == */p/* ]]; then printf 404
else printf 200
fi
MOCK
chmod +x "$fixture/bin/"*
export PATH="$fixture/bin:$PATH" KEEP_TEST_ROOT="$fixture/keep" KEEP_TEST_NEW="$new"
export KEEP_TEST_EVENTS="$fixture/events"
for scenario in candidate-fails rollback success; do
  export KEEP_TEST_SCENARIO="$scenario"
  rm -f "$fixture/keep/current"
  ln -s "$fixture/keep/releases/$old" "$fixture/keep/current"
  : > "$KEEP_TEST_EVENTS"
  status=0
  bash "$fixture/activate" "$new" > "$fixture/output" 2>&1 || status=$?
  if [[ $scenario == success ]]; then
    [[ $status == 0 && $(readlink "$fixture/keep/current") == "$fixture/keep/releases/$new" ]]
    [[ $(cat "$fixture/keep/previous-release") == "$fixture/keep/releases/$old" ]]
  else
    [[ $status == 1 && $(readlink "$fixture/keep/current") == "$fixture/keep/releases/$old" ]]
    if [[ $scenario == candidate-fails ]]; then
      ! grep -q '^restart keep$' "$KEEP_TEST_EVENTS"
    else
      [[ $(grep -c '^restart keep$' "$KEEP_TEST_EVENTS") == 2 ]]
    fi
  fi
  echo "PASS: $scenario"
done
