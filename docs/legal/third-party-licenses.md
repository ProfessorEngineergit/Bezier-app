# Third-party licenses

Bezier is built on other people's work. This file records what, and under what
terms.

Nothing here is licensed under the Bezier license, each dependency keeps its own.

> This list is maintained by hand while the dependency set is small. It should be
> generated from the lockfile before the first public release.

---

## Open CASCADE Technology (OCCT)

The geometry kernel. Every solid in the application is built, modified, and
exported by OCCT.

- **License:** `LGPL-2.1-only WITH OCCT-exception-1.0`
- **Upstream:** <https://dev.opencascade.org/>
- **Copyright:** © OPEN CASCADE SAS
- **Used via:** [`occt-wasm`](https://github.com/andymai/occt-wasm) (binding
  tooling: MIT OR Apache-2.0; the compiled `.wasm` inherits OCCT's LGPL)

**Required notice:** This product makes use of facilities provided by the Open
CASCADE Technology software.

The OCCT exception permits linking OCCT into an application whose own source is
under different terms, provided that notice is given, which is the notice above.

The compiled kernel ships as a standalone `.wasm` file loaded at runtime, with a
configurable URL, so it can be replaced with a user-built version.

## planegcs

The 2D geometric constraint solver, originally part of FreeCAD. It is what turns
"this line is 40 mm and perpendicular to that one" into coordinates.

- **License:** LGPL (LGPL-2.1 per the upstream repository; LGPL-2.0-or-later per
  the npm metadata, to be pinned down precisely)
- **Upstream:** <https://github.com/FreeCAD/FreeCAD> (`src/Mod/Sketcher/App/planegcs`)
- **Copyright:** © the FreeCAD contributors
- **Used via:** [`@salusoft89/planegcs`](https://github.com/Salusoft89/planegcs) -
  a WebAssembly port

**planegcs carries no linking exception**, unlike OCCT. It therefore ships as a
standalone `.wasm` file, loaded at runtime, never inlined into a bundle, with a
configurable URL and a documented procedure for substituting your own build. See
[`docs/legal/licensing.md`](licensing.md).

## Three.js

The 3D renderer.

- **License:** MIT
- **Upstream:** <https://threejs.org/>
- **Copyright:** © 2010–2026 three.js authors

## meshoptimizer

Compresses Nib's model (`apps/studio/public/nib/nib.glb`) and decodes it in the browser. The decoder
is the small WebAssembly module that ships with Three.js (`examples/jsm/libs/meshopt_decoder.module.js`);
the encoder, `gltfpack`, is used once to write the file and is not shipped.

- **License:** MIT
- **Upstream:** <https://github.com/zeux/meshoptimizer>
- **Copyright:** © Arseny Kapoulkine

## ProseMirror

The editor of the wiki: what lets an article be written as it will read, with the Markdown
beside it on request.

- **License:** MIT
- **Upstream:** <https://prosemirror.net/>
- **Copyright:** © Marijn Haverbeke and others
- **Used via:** `prosemirror-model`, `-state`, `-view`, `-commands`, `-keymap`, `-history`,
  `-inputrules`, `-schema-list`, `-dropcursor`, `-gapcursor`

## Fonts

Shipped in `apps/studio/public/fonts`, each with its licence text beside it, under the SIL Open
Font License 1.1: Archivo (`ARCHIVO-OFL.txt`), used for the interface, printed drawings and sketch
text, and Noto Sans, Noto Serif and Noto Sans Mono (`NOTO-OFL.txt`, The Noto Project Authors),
offered for sketch text and used for the letters other fonts lack.

## Build and development tooling

Not shipped to users, but worth recording.

| Package | License |
| --- | --- |
| React | MIT |
| Vite | MIT |
| TypeScript | Apache-2.0 |
| Biome | MIT OR Apache-2.0 |
| Vitest | MIT |
| pnpm | MIT |

---

## A note of thanks

The FreeCAD project deserves specific acknowledgement. planegcs is their work, and
their decade of effort on the topological naming problem, RealThunder's
`ElementMap` design in particular, is the clearest public thinking that exists on
the hardest problem in this codebase.

Dune 3D and Chili3D both demonstrated parts of this approach before we started.
Neither is a dependency; both were instructive.
