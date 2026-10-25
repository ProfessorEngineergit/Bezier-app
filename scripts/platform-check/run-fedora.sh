#!/usr/bin/env bash
#
# Installs the .rpm in a clean Fedora 41 container and runs check.mjs.
#
#   bash scripts/platform-check/run-fedora.sh <file.rpm> [tauri-driver]
#
# Screenshots go to $SHOTS if set. On Apple silicon Docker emulates x86_64, so timings are slower
# than on real hardware. Without a tauri-driver argument it is built from Dockerfile.driver.

set -euo pipefail
rpm="$(cd "$(dirname "${1:?give the .rpm}")" && pwd)/$(basename "$1")"
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/bezier-fedora.XXXXXX")"
cp "$rpm" "$work/bezier.rpm"
cp "$here/Dockerfile.fedora" "$work/Dockerfile"
if [ -n "${2:-}" ]; then
  cp "$2" "$work/tauri-driver"
else
  docker image inspect bezier-linux-drive >/dev/null 2>&1 ||
    docker build --platform linux/amd64 -t bezier-linux-drive -f "$here/Dockerfile.driver" "$here"
  id="$(docker create --platform linux/amd64 bezier-linux-drive:latest)"
  docker cp "$id:/root/.cargo/bin/tauri-driver" "$work/tauri-driver"
  docker rm "$id" >/dev/null
fi
docker build --platform linux/amd64 -q -t bezier-fedora-test "$work" >/dev/null
rm -rf "$work"
shots="${SHOTS:-}"
[ -n "$shots" ] && mkdir -p "$shots" && shots="$(cd "$shots" && pwd)"
docker run --rm --platform linux/amd64 --shm-size=2g -v "$here:/m:ro" \
  ${shots:+-v "$shots:/shots" -e SHOTS=/shots} bezier-fedora-test bash -c '
  Xvfb :99 -screen 0 1440x900x24 >/dev/null 2>&1 &
  export DISPLAY=:99
  sleep 2
  eval "$(dbus-launch --sh-syntax)"
  glxinfo -B 2>/dev/null | grep "OpenGL renderer" || true
  for element in vp9dec opusdec matroskademux avdec_h264 openh264dec; do
    gst-inspect-1.0 "$element" >/dev/null 2>&1 && echo "gstreamer $element: yes" || echo "gstreamer $element: no"
  done
  tauri-driver >/tmp/driver.log 2>&1 &
  sleep 3
  node /m/check.mjs /usr/bin/bezier-desktop
'
