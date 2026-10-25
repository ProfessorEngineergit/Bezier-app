#!/usr/bin/env bash
#
# Copies release-builds/ and SHA256SUMS.txt to test machines over SSH and prints the check command.
#
#   LINUX_HOST=user@linux-vm WINDOWS_HOST=user@vr-pc bash scripts/platform-check/send-builds.sh
#
# Either host is optional. Windows needs OpenSSH Server; files land in ~/bezier-test/.

set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root/release-builds"
shasum -a 256 linux/* windows/* | sed 's# \(linux\|windows\)/# #' > SHA256SUMS.txt

if [ -n "${LINUX_HOST:-}" ]; then
  ssh "$LINUX_HOST" 'mkdir -p ~/bezier-test'
  scp linux/* SHA256SUMS.txt "$root/scripts/platform-check/check.mjs" "$LINUX_HOST:bezier-test/"
  echo "Linux: on $LINUX_HOST, in ~/bezier-test: sha256sum -c --ignore-missing SHA256SUMS.txt"
fi
if [ -n "${WINDOWS_HOST:-}" ]; then
  ssh "$WINDOWS_HOST" 'powershell -NoProfile -Command "New-Item -ItemType Directory -Force bezier-test | Out-Null"'
  scp windows/* SHA256SUMS.txt "$root/scripts/platform-check/check.mjs" "$WINDOWS_HOST:bezier-test/"
  echo "Windows: on $WINDOWS_HOST, in bezier-test: Get-FileHash .\\Bezier-0.1.0-alpha-x64-setup.exe"
fi
