# ADR 0001: Geometry kernel: OCCT via `occt-wasm`

- **Status:** Accepted
- **Date:** 2026-08-04

## Context

We need a geometry kernel that produces exact solids (B-Rep), runs in a browser,
exports STEP, and is free. The project only exists because clean CAD is expensive,
and it is expensive largely because of Parasolid licensing. Paying for a kernel
would dissolve the reason to build this.

We also need something the kernel is not usually asked for: **per-operation
evolution data**, so we can build a stable geometry referencing layer on top of it
(see [ADR 0004](0004-app-architecture.md)).

## Decision

### Mesh-normal orientation experiment (2026-09-10)

`tools/spikes/face-normal-orientation.ts` compares all six box faces. In occt-wasm
3.8.3, `meshShape` returns the underlying surface normal even when the B-Rep face
is reversed: both X faces return +X, both Y faces +Y, both Z faces +Z.
`surfaceNormal` includes face orientation and returns the correct outward normal.
The same omission occurs when meshing the complete solid. Tessellation therefore
flips normals once per vertex of reversed faces; exact planar face extrusion uses
`surfaceNormal`. Real-kernel tests cover outward and inward pulls of all six faces.

Superseded by the upgrade to occt-wasm 5.3.5 (2026-09-28). From 5.x,
`meshShape` already points a reversed face's normals out of the solid, so the
flip above turned them inward and every face-pull arrow pointed into the part
(caught by the e2e gizmo tests). The flip is gone; `occt-kernel.test.ts`
("points every normal of a displayed solid out of it") pins the behaviour.

### Circular selection and cylindrical wall edits (2026-10-04)

`tools/spikes/round-selection.ts` confirms that an extruded circle has three exact faces
and two roundable circular rims. The rim remains one edge regardless of render
subdivisions. Picking therefore uses seams between named faces, including silhouettes
where only one adjacent face is visible; gizmos read normals beside the picked seam.

The same experiment resizes a box's cylindrical hole from radius 5 to 7 to 4 mm
with valid solids. A bounded annular boolean edits a complete cylindrical wall;
partial or irregularly trimmed cylinders are declined. The replacement wall is
explicitly traced to its input so saved face references survive the radius edit.
Real-kernel tests cover through and blind holes, a rotated boss, and session
preview, commit, reopening and undo. No existing face tags or reference formats change.

### Upgrade to occt-wasm 5.3.5 (2026-09-28)

Forced by a real file. On 3.8.3, importing the Voron 2.4 printer assembly
(241 MB STEP, 1715 solids) left the WebAssembly instance corrupted: afterwards
even a small, previously fine file failed to mesh with "memory access out of
bounds". The heap was only 1.43 GB, so this was not the 2 GB pointer limit;
the 5.x changelog lists a release-only heap corruption fix (4.3.4) and an 8 MB
stack (5.0.0), and on 5.3.5 the same import leaves the instance healthy. The
only API change that touched us: binary `exportStl` returns bytes. All 61
kernel tests and the e2e suite passed on the new binding.

### Whole assemblies are handed to OCCT one solid at a time (2026-09-28)

On the same assembly, `meshShape` on the compound failed outright,
`wireframe` ran for over ten minutes and exact `getBoundingBox` took 57 s,
while per solid the mesh took 2.4 s and the outlines 31 ms per hundred solids.
`tessellation.ts` therefore meshes, outlines and bounds a multi-solid body
solid by solid and joins the pieces, and keeps each solid's mesh and outline
for reuse while the solid is unchanged.

Use Open CASCADE Technology (OCCT) as the geometry kernel, accessed through the
**[`occt-wasm`](https://github.com/andymai/occt-wasm)** WebAssembly binding.

Wrap it behind our own `@bezier/kernel` package. **No other package in the
monorepo may import `occt-wasm` directly.** This is enforced by lint rule, not by
convention.

## Rationale

OCCT is the only free B-Rep kernel that is simultaneously production-grade at
booleans and fillets, ships native STEP I/O, and is proven in the browser. Its
license, LGPL-2.1 **with `OCCT-exception-1.0`**, explicitly permits static
linking into closed-source applications, which is what makes our commercial
license viable at all.

**`occt-wasm`** was chosen over the alternatives on one decisive criterion. It
exposes OCCT's shape evolution data through `*WithHistory` operation variants:

```ts
filletWithHistory(solid, edges, radius, inputFaceHashes, hashUpperBound): EvolutionData

interface EvolutionData {
  result:    ShapeHandle;
  modified:  number[];  // input face hashes that survived, changed
  generated: number[];  // new face hashes the operation created
  deleted:   number[];  // input face hashes that no longer exist
}
```

That is the raw input to topological naming, which is our core IP. Neither
alternative provides it usably:

- **`opencascade.js`** exposes all of OCCT (so the data is reachable) but has not
  published to npm since March 2023 and tracks OCCT 7.6.2, four years and
  two major versions stale. Its auto-generated TypeScript is C++-in-TS with manual
  memory management.
- **`replicad`** is a well-designed fluent modelling library, actively maintained
  and MIT, but it deliberately abstracts the kernel away and does not surface
  evolution data. It also sits on `opencascade.js`, inheriting its staleness.

Supporting factors for `occt-wasm`: tracks OCCT 8.0.1, published within a day of
this decision, hand-written TypeScript with branded `ShapeHandle` types and a
structured `OcctErrorCode` enum, built-in Comlink worker support, arena memory
with `Symbol.dispose`, and 4.7 MB brotli (measured, not claimed).

## Consequences

### Positive

- We get a mature kernel for free, with the history data our differentiator needs.
- Our app layer stays unencumbered by copyleft (see [ADR 0003](0003-license-model.md)).
- STEP/STL/glTF I/O is solved on day one rather than being a project of its own.

### Negative / accepted risks

- **Bus factor.** `occt-wasm` is a single-maintainer project with ~36 stars. We
  accept this because its tooling is MIT OR Apache-2.0, we can legally fork and
  maintain it ourselves, and because the façade bounds the blast radius to one
  package. Mitigation is mandatory, not optional: during the vertical slice we
  must stand up our own OCCT→WASM build from source and confirm we can produce an
  equivalent artifact. We prove the escape hatch before we need it.
- **History is face-level only.** Edges and vertices are not tracked by the kernel.
  `@bezier/core` must derive edge identity from adjacent face pairs and vertex
  identity from incident face sets. Budgeted into M2.
- **Curated API means gaps.** Not all of OCCT is exposed. Missing operations mean
  upstreaming a PR or forking.
- **Payload.** 4.7 MB brotli must be lazily loaded, worker-hosted, and cached.
- **Browser floor:** Chrome 114+, Safari 17.2+, Firefox 121+ (WASM tail calls).

### ANSWERED: face hash stability (2026-08-05)

This was the highest-uncertainty unknown in the project. It has been settled by
experiment: [`tools/spikes/face-hash-stability.ts`](../../tools/spikes/face-hash-stability.ts),
run against occt-wasm 3.8.3 / OCCT 8.0.1.

OCCT face hashes are not an identity.

| Test | Hashes preserved | Signatures preserved |
| --- | --- | --- |
| Identical rebuild, same kernel session | **0 / 6** | 6 / 6 |
| Parameter change 40 → 50 mm | 0 / 6 | **1 / 6** |
| Identical rebuild, fresh kernel instance | 6 / 6 ⚠️ | 6 / 6 |

Three things follow, and the third is the one that matters.

1. Hashes are allocation-derived, not geometry-derived. Rebuilding the *same*
box in the *same* session preserves none of them. They are usable as short-lived
keys inside a single rebuild pass, which is exactly how `EvolutionData` uses
them, and for nothing else. Never persist one.

2. The fresh-instance result is a trap, not good news. A clean arena hands
out the same addresses in the same order, so the hashes merely repeat. That is
reproducibility, not identity, and it disappears the moment anything is allocated
first. A spike that had only tested the reopen-the-document case would have
reported "stable" and sent the naming layer down a road that fails in production
under any real editing session. Worth remembering when designing future spikes:
test the *realistic* path, not the cleanest one.

3. Geometric signature is also not enough, and this is the more interesting
finding. Widening a box from 40 to 50 mm leaves only one of its six faces
with an unchanged area and centroid, even though a user would say all six faces
are obviously still there. Geometry moving under you is not an edge case; it is
what parametric modelling *is*. So geometry cannot be the key either.

Consequence, the design holds. Identity has to be provenance: which
feature produced the face, and which of that feature's outputs it is, carried
across rebuilds along the `EvolutionData` chain. Geometric signature is a
tie-breaker for disambiguating siblings, never the primary key.

That is what [`packages/core/src/stable-ref.ts`](../../packages/core/src/stable-ref.ts)
already does, `F:extrude-1:side-2` names a face by what made it. The spike
validates the architecture rather than forcing a change to it.

M2 is therefore cheaper than the pessimistic case, because we never have to
build a fuzzy geometric matcher as the primary mechanism. It is not free: the
`EvolutionData` threading in `@bezier/core` is still the hard part, and
tie-breaking between geometrically similar siblings still needs signatures.

### ANSWERED: exact sketch curves in profiles (2026-08-09)

[`tools/spikes/profile-curves.ts`](../../tools/spikes/profile-curves.ts) confirms that the
kernel can build and extrude both a one-edge circular wire and a mixed wire made
from one circular arc plus line edges. The resulting solids retain exact OCCT
cylindrical surfaces rather than tessellated polygon approximations.

Consequently, sketch profiles cross the kernel boundary as exact line, arc, and
circle segments. Sampling those curves remains a renderer concern and must not
become the modelling representation.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| **truck** (Rust) | Solid booleans still listed as future work. CADmium built our exact product on it and archived in Sept 2025. |
| **Manifold** | Mesh booleans, not B-Rep. No exact fillets, no STEP. Possible future fast-preview path. |
| **libfive / implicit** | No B-Rep, no STEP, no face selection. A different product. |
| **SolveSpace kernel** | GPL-3.0-or-later (viral) and weaker NURBS booleans. |
| **Parasolid / ACIS / C3D** | Reconstitutes the cost structure this project exists to undercut. |

## MEASURED: dimensions in isometric drawings (2026-10-05)

[`tools/spikes/drawing-isometric.ts`](../../tools/spikes/drawing-isometric.ts) projects an exact
40 × 20 × 15 mm box and compares its X-edge in paper space with its model endpoints.
The isometric projected length is 32.65986323710904 mm; the model distance is 40 mm.
After releasing the temporary HLR shapes and vertex handles the live shape count
is unchanged (1 before, 1 after).

Consequently `DrawingProjection` carries exact model vertices alongside their
projected positions and depth. The drawing editor snaps only visible HLR endpoints;
in isometric views it accepts only endpoints with a matching exact model vertex,
chooses the frontmost vertex when projections coincide, and measures their 3D
positions. Arbitrary HLR occlusion endpoints cannot prove a 3D distance and are
not eligible there. Orthographic dimensions retain projected distances, while
magnified detail views account for their extra scale. This metadata is disposable
per projection; it does not persist OCCT handles or pretend to provide stable
identity across rebuilds.

## Moving one face or edge (2026-10-14)

occt-wasm 5.3.5 has no local "move face" operation: no replace-face, no direct-modelling move, and
the offset and draft calls act on a whole solid or one face's draft angle. The experiment
(`packages/kernel/src/move-vertices.test.ts`, against the real module) is to build the solid again
from its faces: every corner on the picked face or edge is carried by the vector, each face that
has one is made again from its new corners (`makeLineEdge`, `makeWire`, `makeFace`), the rest are
kept and the set is sewn with `sewAndSolidify`.

What it showed:

- It is exact for flat faces with straight edges. A box's top face moved up, and one top edge
  lifted across the end faces (which tilts the top and the side), both come back valid with the
  right volume.
- A face that would stop being flat (an edge pushed along itself, so two corners of each end face
  leave their plane) has to be refused, and is, by measuring the corners against their best plane.
  Bending it to fit would be a different shape than the one asked for.
- `sewAndSolidify` can return the solid inside out (negative `getVolume`); `reverseShape` turns it.
- Hashes of the sewn faces are new, so the history is written by hand: each old face is paired
  with the new face that has the same corners. Names given before the move find their faces
  after it (`move-parts.test.ts`).
- Curved faces and faces with holes are not handled: they come through unchanged when the move
  does not reach them, and the move is refused when it does.
