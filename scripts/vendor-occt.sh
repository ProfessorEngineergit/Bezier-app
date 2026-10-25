#!/usr/bin/env bash
# Copies a built better-occt (occt-wasm fork, ADR 0001) into vendor/occt-wasm, which
# @bezier/kernel depends on as `occt-wasm`. Vendored because CI cannot build OCCT; the .wasm stays
# a separately loaded file (ADR 0003).
#
#   scripts/vendor-occt.sh ../better-occt
#
# The checkout must have run `cargo xtask build --release` and `cd ts && npm run build`.
set -euo pipefail
source_dir=${1:?usage: scripts/vendor-occt.sh <better-occt checkout>}
here=$(cd "$(dirname "$0")/.." && pwd)
target="$here/vendor/occt-wasm"
[ -f "$source_dir/ts/dist/occt-wasm.wasm" ] || { echo "no ts/dist/occt-wasm.wasm in $source_dir: build it first" >&2; exit 1; }
commit=$(git -C "$source_dir" rev-parse HEAD)
dirty=$(git -C "$source_dir" status --porcelain --untracked-files=no | head -1)
[ -z "$dirty" ] || { echo "$source_dir has uncommitted changes: commit them so the build can be traced" >&2; exit 1; }

rm -rf "$target/dist"
mkdir -p "$target/dist"
# Skip source maps: they point into a local checkout.
(cd "$source_dir/ts/dist" && find . -type f ! -name '*.map' -exec cp {} "$target/dist/" \;)
find "$target/dist" -name '*.js' -o -name '*.d.ts' | while read -r file; do
  sed -i.bak '/^\/\/# sourceMappingURL=/d' "$file" && rm "$file.bak"
done
cp "$source_dir/LICENSE" "$source_dir/LICENSE-MIT" "$source_dir/LICENSE-APACHE" "$target/"
version=$(node -p "require('$source_dir/ts/package.json').version")
node - "$target/package.json" "$version" "$commit" <<'NODE'
const [file, version, commit] = process.argv.slice(2);
const pkg = {
  name: 'occt-wasm',
  version: `${version}-bezier`,
  description: 'occt-wasm with the face tweak, built from better-occt',
  license: 'MIT OR Apache-2.0',
  type: 'module',
  exports: {
    '.': { import: './dist/index.js', types: './dist/index.d.ts' },
    './worker': { import: './dist/worker.js', types: './dist/worker.d.ts' },
    './dist/occt-wasm.js': './dist/occt-wasm.js',
    './dist/occt-wasm.wasm': './dist/occt-wasm.wasm',
  },
  dependencies: { comlink: '^4.4.2' },
  betterOcct: { commit },
};
require('node:fs').writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
NODE
echo "vendored better-occt $commit ($(du -h "$target/dist/occt-wasm.wasm" | cut -f1) wasm)"
