#!/usr/bin/env bash
#
# Builds the x86_64 Linux packages from HEAD in a Docker container.
#
#   bash scripts/linux-build/build.sh <out-dir> [alpha]
#
# `alpha` sets VITE_CHANNEL=alpha. BUNDLES selects packages (default deb,rpm,appimage). The .rpm is
# packed from the .deb by rpm-from-deb.sh because Tauri's rpm step does not finish under emulation.
# On Apple silicon Docker emulates x86_64, which makes the Rust build slow.

set -euo pipefail
out="$(cd "${1:?give an output directory}" && pwd)"
channel="${2:-stable}"
root="$(git rev-parse --show-toplevel)"
here="$root/scripts/linux-build"

src="$(mktemp -d "${TMPDIR:-/tmp}/bezier-linux-src.XXXXXX")"
git -C "$root" archive HEAD | tar -x -C "$src"

wanted=",${BUNDLES:-deb,rpm,appimage},"
# Tauri builds the .deb and AppImage; the .rpm is derived from the .deb.
tauri_bundles=""
case "$wanted" in *,deb,*|*,rpm,*) tauri_bundles=deb ;; esac
case "$wanted" in *,appimage,*) tauri_bundles="${tauri_bundles:+$tauri_bundles,}appimage" ;; esac

docker build --platform linux/amd64 -t bezier-linux-build "$here"
# Named volumes cache the Rust build and downloads between runs; a cold emulated build is slow.
docker run --rm --platform linux/amd64 \
  -v "$src:/src" -v "$out:/out" \
  -v bezier-linux-target:/src/apps/desktop/src-tauri/target \
  -v bezier-linux-cargo:/root/.cargo/registry \
  -v bezier-linux-pnpm:/root/.local/share/pnpm/store \
  -e VITE_CHANNEL="$( [ "$channel" = alpha ] && echo alpha || echo '' )" \
  -e VITE_STORE_URL="${VITE_STORE_URL:-}" \
  -e BUNDLES="$tauri_bundles" \
  bezier-linux-build bash -lc '
    set -e
    pnpm install --frozen-lockfile
    pnpm --filter @bezier/desktop exec tauri build --bundles "$BUNDLES"
    bundle=apps/desktop/src-tauri/target/release/bundle
    case ",$BUNDLES," in *,deb,*) cp $bundle/deb/*.deb /out/ ;; esac
    case ",$BUNDLES," in *,appimage,*) cp $bundle/appimage/*.AppImage /out/ ;; esac
  '
rm -rf "$src"
case "$wanted" in
  *,rpm,*) bash "$here/rpm-from-deb.sh" "$(ls "$out"/*.deb | head -1)" "$out" ;;
esac
ls -la "$out"
