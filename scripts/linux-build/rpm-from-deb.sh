#!/usr/bin/env bash
#
# Repackages the .deb's files as an .rpm in a Fedora container.
#
#   bash scripts/linux-build/rpm-from-deb.sh <file.deb> <out-dir>
#
# Tauri's rpm step does not finish under x86 emulation on Apple silicon. Dependencies come from
# tauri.conf.json. Build-id links are disabled: on Fedora they can conflict with paths owned by
# other installed packages.

set -euo pipefail
deb="$(cd "$(dirname "${1:?give the .deb}")" && pwd)/$(basename "$1")"
out="$(cd "${2:?give an output directory}" && pwd)"
root="$(git rev-parse --show-toplevel)"
conf="$root/apps/desktop/src-tauri/tauri.conf.json"
version="$(node -p "require('$conf').version")"
requires="$(node -p "require('$conf').bundle.linux.rpm.depends.join(', ')")"

docker run --rm -v "$deb:/in/app.deb:ro" -v "$out:/out" \
  -e VERSION="$version" -e REQUIRES="$requires" fedora:41 bash -c '
    set -euo pipefail
    dnf -y -q install rpm-build binutils >/dev/null
    mkdir -p /w/root && cd /w
    ar x /in/app.deb
    tar -xf data.tar.* -C /w/root
    files="$(find /w/root -type f | sed "s#^/w/root##; s/.*/\"&\"/")"
    cat > /w/bezier.spec <<SPEC
Name: Bezier
Version: $VERSION
Release: 1
Summary: Bezier - local-first parametric CAD
License: GPL-3.0-or-later
Requires: $REQUIRES
AutoReqProv: no
%define _binary_payload w6.gzdio
%define __strip /bin/true
%define debug_package %{nil}
%define _build_id_links none
%description
Local-first parametric CAD.
%install
cp -a /w/root/. %{buildroot}/
%files
$files
SPEC
    # --target instead of BuildArch, which rejects a foreign architecture; only files are packed.
    rpmbuild --target x86_64 --define "_topdir /w/top" -bb /w/bezier.spec >/w/log 2>&1 \
      || { tail -20 /w/log; exit 1; }
    cp /w/top/RPMS/x86_64/*.rpm /out/
    rpm -qp --qf "%{NAME}-%{VERSION} %{ARCH}, requires: " /out/*.rpm
    rpm -qpR /out/*.rpm | grep -v rpmlib | paste -sd " " -
  '
