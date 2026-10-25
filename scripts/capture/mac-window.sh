#!/usr/bin/env bash
# Screenshots the macOS app window including its native frame. Tauri has no WebDriver on macOS,
# so the app is driven with the keyboard through System Events.
#
#   scripts/capture/mac-window.sh <Bezier.app> <output directory>
#
# Needs Screen Recording and Accessibility permission for the terminal, and an app built with a
# separate identifier so it starts with an empty profile:
#
#   pnpm --filter @bezier/desktop exec tauri build --bundles app \
#     --config '{"identifier":"app.bezier.shots"}'
#
# Delete ~/Library/WebKit/app.bezier.shots and ~/Library/Caches/app.bezier.shots between runs.
set -euo pipefail

APP="${1:?usage: mac-window.sh <Bezier.app> <output directory>}"
OUT="${2:?usage: mac-window.sh <Bezier.app> <output directory>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"

window_id() { swift "$HERE/mac-window-id.swift" Bezier | head -1 | cut -d' ' -f1; }
tab() { for _ in $(seq 1 "$1"); do osascript -e 'tell application "System Events" to key code 48'; sleep 0.2; done; }
press() { osascript -e "tell application \"System Events\" to $1"; }
shot() {
  sleep "${2:-2}"
  screencapture -o -l "$(window_id)" "$OUT/macos-window-$1.png"
  echo "kept macos-window-$1"
}

open -n "$APP"
for _ in $(seq 1 40); do [ -n "$(window_id)" ] && break; sleep 0.5; done
sleep 5
shot 1-start

# Eight tabs reach New Project (search, All Projects, Learn, New folder, Settings, sidebar edge,
# Bezier crumb, New Project).
tab 8
press 'key code 36'                       # Return: new project
sleep 5
press 'keystroke "e"'                     # E: Extrude the starter box
sleep 8                                   # wait for the first toast to disappear
shot 2-editor

press 'key code 21 using {command down, option down}'   # Drawings
sleep 4
shot 3-drawings

press 'key code 18 using {command down, option down}'   # Modeling again
sleep 3
press 'keystroke "," using command down'                # Settings
sleep 2
shot 4-settings
