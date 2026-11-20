#!/usr/bin/env bash
# Capture the four judge screenshots from out/dashboard with headless Chrome.
# Each shot is a route through the page's own hash router, so what the judge sees
# is what a reader sees at that link. Truecolor PNG, 1440x900.
set -euo pipefail

CHROME="${CHROME:-$HOME/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$REPO/out"
DASH="$OUT/dashboard"
SHOTS="$REPO/screenshots"
mkdir -p "$SHOTS"

# slug for the detail views: the board's rank 1.
SLUG="${SLUG:-steakhouse-financial}"

capture() {
  local name="$1" hash="$2"
  local tmp
  tmp="$(mktemp --suffix=.png)"
  "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size=1440,900 \
    --default-background-color=00000000 \
    --virtual-time-budget=6000 --run-all-compositor-stages-before-draw \
    --screenshot="$tmp" "file://$DASH/index.html$hash" >/dev/null 2>&1
  mv "$tmp" "$SHOTS/$name"
  stat -c '%n %s bytes' "$SHOTS/$name"
}

capture 1-board.png ""
capture 2-detail.png "#/p/$SLUG"
capture 3-farm-plan.png "#/p/$SLUG?tab=farm"
capture 4-filtered.png "#/f?watch=1&sort=implied"