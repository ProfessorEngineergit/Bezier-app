# The kernel, and how it gets faster

Geometry is computed by [Open CASCADE](https://dev.opencascade.org/) (OCCT), an open-source kernel, compiled
to WebAssembly through [occt-wasm](https://github.com/andymai/occt-wasm). Commercial CAD uses native kernels
such as Parasolid. **Ours is slower per operation today.** WebAssembly is slower than native code, and OCCT's
booleans, where most of the time goes, are slower than Parasolid's. There is no public benchmark of Parasolid,
so there is no number for the gap.

## Where the time goes

OCCT's own documentation puts the intersection phase at about 89% of a boolean operation
([specification](https://dev.opencascade.org/doc/overview/html/specification__boolean_operations.html)).
Our wrapper costs nothing measurable next to it: bookkeeping for the history was within noise, face hashing
0.003 ms, shape construction 0.037 ms, against a 4.2 ms cut. So the levers are doing fewer or cheaper
operations, not trimming our own code. The rebuild cache is one such lever: changing the last of 40 steps costs
35 ms instead of 617 ms ([`benchmarks.md`](benchmarks.md)).

## What we found

| | Result | State |
| --- | --- | --- |
| **One boolean against many tools** instead of one after another | 3 to 4x faster for 4 to 8 cuts, but with no history; fusing the tools first keeps the history and is 2.5x faster (`tools/spikes/fused-tool.ts`) | Not used by the rebuild yet |
| **Several kernels side by side** for independent bodies | 1, 2, 4, 8 workers: 1.00x, 2.02x, 4.08x, 7.69x on 48 bodies, Apple M1 Max (`pnpm --filter @bezier/bench parallel`) | Not used by the app yet. Helps documents with several bodies, not one boolean on one body |
| **OCCT 8.0.x** | 8.0.1 (2026-07-30) is reported 17 to 20% faster on booleans upstream | occt-wasm 5.x tracks it |
| **SIMD** | The 5.x builds of occt-wasm have it; the 3.8.3 build the first spikes ran on did not | Already there |
| **Threads inside OCCT** | [libcascade](https://www.libcascade.xyz/) ships a threaded build; its own numbers for booleans are small. A browser needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on every page; the desktop app can set both ([Tauri](https://v2.tauri.app/reference/config/#headers)) | Not tried |
| **Exposing more of OCCT** (oriented bounding boxes, glue mode, parallel mode) | occt-wasm 5.3.5 has none of them | A pull request upstream, not a fork |

## Other kernels

- **[Truck](https://github.com/ricosjp/truck)** (Rust, Apache-2.0) is active but has no documented fillet or shell.
- **[Fornjot](https://github.com/hannobraun/fornjot)** (Rust) was archived in 2026-06.
- **[Manifold](https://github.com/elalish/manifold)** (C++, Apache-2.0) is fast and parallel but works on meshes, not exact
  surfaces, so it cannot carry a face with a stable name. It could serve as a fast preview, not as the model.

Nothing open replaces OCCT's feature set today. The kernel sits behind an interface in `packages/kernel`, so
the choice can change ([ADR 0001](adr/0001-geometry-kernel.md)). Forking OCCT is not on the list: it is
millions of lines of C++ that we would have to keep merging.

## In order

1. Use the fused boolean in the rebuild, keeping the history.
2. A pool of kernel workers for bodies that do not depend on each other.
3. Follow OCCT and occt-wasm releases, and re-run the benchmarks on each.
4. Ask upstream for bounding boxes, glue mode and parallel mode.
5. Try the threaded build in the desktop app on real models, and keep it only if it wins.
6. Revisit Manifold as a preview, and Truck once it has fillets.

Not measured: threaded OCCT in a browser, and anything on Linux or Windows. The worker measurement is one machine.

## Facts that are easy to get wrong

Each of these was established by experiment and is written down because guessing
wrong is expensive:

- **OCCT face hashes are not stable.** An identical rebuild in the same session
  preserves *zero* of them. They are valid only inside one rebuild pass. Never
  persist one. ([ADR 0001](adr/0001-geometry-kernel.md),
  `tools/spikes/face-hash-stability.ts`)
- **Geometric signatures are not identity either.** Widening a box leaves only one
  of six faces geometrically unchanged. Identity is *provenance*.
- **`occt-wasm`'s `Mesh.faceGroups` are index offsets, not triangle offsets**,
  despite the documentation. Worked around in `occt-kernel.ts`.
- **`occt-wasm`'s `EvolutionData.modified` is not a hash list.** It is a flat run
  of `[inputHash, count, ...newHashes]`.
- **`meshShape` hashes its face groups with a different upper bound** (2147483647)
  than the rest of the kernel (1000003), so those hashes match nothing the naming
  layer produces. `tessellate` resolves them to positions instead, and
  `Mesh.triangleFaces` is therefore an **index into `describeFaces()`**, not a
  `FaceHash`. A test that only counted distinct values missed this for exactly as
  long as it existed, six hashes count the same as six indices.
- **`EdgeSet.polylineStarts` holds float offsets**, not point indices. A box comes
  back as 12 groups at 0, 6, 12 … 66 over 72 floats.
- **`generated` comes back empty for fillets.** Recovered by subtraction in
  `occt-kernel.ts`.
- **Never hand OCCT a whole assembly to mesh, outline or bound.** On a
  1715-solid compound `meshShape` fails, `wireframe` takes over ten minutes and
  exact bounds take a minute; solid by solid it is seconds.
  (`tessellation.ts`, ADR 0001)
- **Since occt-wasm 5, mesh normals already point out of the solid**, reversed
  faces included. 3.8.3 did not, and the old workaround now points them inward.
  (ADR 0001)
- **OCCT's mesher drops faces without a word.** Cones that close to a point (and a few
  planes) come back from `meshShape` with no triangles at 0.5 rad, while the same face meshes at
  0.7. The shape stays valid, so nothing reports it: the part shows a hole and an STL written by
  OCCT has one too. 172 of the Voron's 1715 solids. `mesh-mend.ts` re-meshes with a looser angle;
  never write a mesh path that skips `meshPiece`. (`mesh-mend.test.ts`, `mesh-integrity.test.ts`)
- **OCCT never meshes a shape coarser than it already is.** It keeps a face's
  triangulation and meshes again only for a finer setting, so a coarser
  request quietly returns the old mesh. `tessellation.ts` meshes a copy then.
- **OPFS appends are not cheap.** `createWritable({ keepExistingData: true })`
  copies the whole file first (310 ms at 250 MB in WebKit). Keep appended
  files small, `packages/storage/src/journal-file.ts`.
- **occt-wasm rounds and bevels one solid at a time.** `fillet`/`chamfer`
  cast their target to `TopoDS::Solid` and refuse a compound outright, even a
  compound of one solid, and `partition` always returns a compound. The
  kernel treats each part an edge is on by itself (`edge-parts.ts`,
  `tools/spikes/fillet-imported.ts`).
