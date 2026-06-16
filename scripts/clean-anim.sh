#!/usr/bin/env bash
# clean-anim.sh — drop partly-painted "gray" frames from a screen-capture clip.
#
# Screen captures of the dark-theme UI sometimes include frames where the canvas
# hasn't fully painted — page load, teardown, mid-navigation. The unpainted
# region renders as flat gray, which spikes a frame's average luma (YAVG) well
# above the ~30-40 of a real dark-theme frame. This finds those frames by
# per-frame average luma and drops them, re-encoding a clean VP9 .webm.
#
# Usage:
#   scripts/clean-anim.sh <input.webm> [output.webm] [luma-threshold]
#
#   input.webm       source clip (e.g. a fresh scripts/capture-anim.mjs capture)
#   output.webm      cleaned clip          (default: <input>-clean.webm)
#   luma-threshold   drop frames with average luma >= this value
#                    (default: 80; real dark frames ~30-40, gray ones ~90+)
#
# Requires a real ffmpeg + ffprobe on PATH (the playwright-bundled ffmpeg is too
# minimal — no signalstats / metadata muxing). On macOS: `brew install ffmpeg`.
#
# Convention: commit cleaned capture .webm files under screenshots/pr/.
set -euo pipefail

in="${1:?usage: clean-anim.sh <input.webm> [output.webm] [luma-threshold]}"
out="${2:-${in%.webm}-clean.webm}"
thr="${3:-80}"

command -v ffmpeg  >/dev/null 2>&1 || { echo "ffmpeg not found (brew install ffmpeg)"  >&2; exit 1; }

# Print "<total> <bright>" for a clip: frame count, and how many sit at/above the
# luma threshold (i.e. are partly gray).
count_bright() {
  ffmpeg -i "$1" -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG" -an -f null - 2>&1 \
    | grep -oE "lavfi.signalstats.YAVG=[0-9.]+" | sed 's/.*=//' \
    | awk -v t="$thr" '{ n++; if ($1 + 0 >= t) b++ } END { printf "%d %d", n + 0, b + 0 }'
}

read -r total bright <<<"$(count_bright "$in")"
echo "input:  $in — $total frames, $bright at/above luma $thr (gray)"

if [ "$bright" -eq 0 ]; then
  echo "no gray frames at threshold $thr — nothing to do"
  exit 0
fi

# Keep only frames below the threshold, then renumber timestamps so the dropped
# frames leave no gaps.
ffmpeg -y -i "$in" \
  -vf "signalstats,metadata=mode=select:key=lavfi.signalstats.YAVG:value=${thr}:function=less,setpts=N/FRAME_RATE/TB" \
  -an -c:v libvpx-vp9 -crf 30 -b:v 0 -row-mt 1 "$out" >/dev/null 2>&1

read -r ototal obright <<<"$(count_bright "$out")"
echo "output: $out — $ototal frames, $obright gray remaining"

if [ "$obright" -ne 0 ]; then
  echo "WARNING: $obright gray frame(s) remain — try a lower threshold than $thr" >&2
  exit 1
fi
echo "done — dropped $((total - ototal)) frame(s)"
