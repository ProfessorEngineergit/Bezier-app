# ADR 0004: Application architecture and package boundaries

- **Status:** Accepted
- **Date:** 2026-08-04

## Context

We are reusing three large dependencies (a geometry kernel, a constraint solver, a
renderer) and building two things of our own (a parametric feature layer and the
UI). The dependencies are old, large, C++-derived, and each has its own licence
obligations. Without hard boundaries this becomes a codebase where a kernel handle
leaks into a React component and nothing can ever be changed again.

## Decision

A strictly layered monorepo, pnpm workspaces, with dependencies pointing in one
direction only.

```
apps/studio          the shell that assembles everything
      ↓
@bezier/ui           React components, viewport chrome, panels, gizmos
      ↓
@bezier/renderer     Three.js scene, tessellation → mesh, edge extraction
      ↓
@bezier/core         ← OUR IP: feature graph, history, stable references
      ↓            ↘
@bezier/kernel     @bezier/solver
      ↓                  ↓
   occt-wasm      @salusoft89/planegcs
   (OCCT/LGPL)       (planegcs/LGPL)
```

### Rules, enforced by lint and CI rather than goodwill

These are configured as `noRestrictedImports` overrides in `biome.json`, one per
package, each with a message explaining *why* rather than just refusing. They are
verified to fire, a violation fails `pnpm lint` with exit code 1, so CI catches
it. Left to review alone, a single stray import would quietly destroy the
encapsulation that keeps replacing the kernel cheap.

1. **A package may only import from packages strictly below it.** No upward
   imports, no cycles.
2. **`occt-wasm` may only be imported by `@bezier/kernel`.** `@salusoft89/planegcs`
   may only be imported by `@bezier/solver`. This keeps the two swappable
   dependencies, and their LGPL obligations, in exactly two known places.
3. **No raw kernel handles above `@bezier/core`.** The renderer and UI see our own
   vocabulary types, never a `ShapeHandle`.
4. **`@bezier/core` never imports Three.js or React.** It must be testable in
   plain Node with no DOM.

## Layer responsibilities and the data crossing each boundary

### `@bezier/kernel`: tame the kernel

Wraps `occt-wasm`. Owns WASM loading, the worker, and memory lifetime.

- **Accepts:** plain geometric requests, "extrude this profile 5 mm", "fillet
  these edges at radius 2".
- **Returns:** opaque `ShapeId` handles, plus `EvolutionData` describing which
  faces were modified, generated, and deleted.
- **Never throws opaquely.** Every operation returns a typed result, kernel
  failures are normal, expected, and must be survivable. A failed fillet marks one
  feature as failed; it does not take down the document.
- Runs in a Web Worker. Geometry must never block the UI thread.

### `@bezier/solver`: tame the solver

Wraps `@salusoft89/planegcs`. Owns the typed constraint vocabulary.

- **Accepts:** a sketch, 2D primitives and constraints, with stable string ids.
- **Returns:** solved coordinates, plus diagnostics: degrees of freedom,
  conflicting constraints, redundant constraints, all mapped back to our ids.
- Diagnostics are a first-class return value, not an afterthought. Surfacing them
  well in the UI is a deliberate differentiator.

### `@bezier/core`: the parametric layer (our IP)

The reason the project exists. Owns:

- **The feature graph.** An ordered list of features (sketch, extrude, fillet,
  shell, hole…), each with parameters, forming a rebuildable history.
- **Rebuild / re-solve.** Given a changed parameter, recompute the minimum
  necessary and produce a new solid, including partial results when a feature
  fails.
- **Stable geometry references, the topological naming problem.** This is the
  hardest thing in the codebase and the thing competitors do not have.

  The problem: a user fillets an edge, then changes an earlier dimension. The
  kernel rebuilds and hands back a solid whose faces have entirely different
  internal ids. *Which edge did the user mean?*

  Our raw material is the kernel's `EvolutionData`, a per-operation map of which
  input faces were modified, which were generated, and which were deleted. By
  threading that through the whole rebuild, we can carry a persistent name for a
  face from one rebuild to the next.

  Two known complications, both budgeted into M2:

  - **The kernel tracks faces only.** Edge and vertex identity must be *derived* -
    an edge as the intersection of its two adjacent named faces, a vertex by its
    incident face set.
  - **Face hashes are not an identity, settled by experiment**
    ([ADR 0001](0001-geometry-kernel.md), `tools/spikes/face-hash-stability.ts`).
    An identical rebuild in the same session preserves 0 of 6 hashes, and a
    parameter change leaves only 1 of 6 faces geometrically unchanged. Identity
    must therefore be provenance, carried along the `EvolutionData` chain, with
    geometric signature used only to break ties between siblings.

  Prior art worth studying (design, not code): FreeCAD's `ElementMap` and
  `ComplexGeoData`.

- **Accepts:** user intent, "change parameter X to 50", "add a fillet on the edge
  named `<stable-ref>`".
- **Returns:** a rebuilt document with tessellated geometry and per-feature status.
- **Pure and headless.** No DOM, no Three.js, no React. Fully unit-testable.

### `@bezier/renderer`: make it visible

Three.js. WebGL today, structured so WebGPU is a swap rather than a rewrite.

- **Accepts:** tessellated meshes and extracted edge polylines from `core`.
- **Returns:** a rendered scene, plus picking, screen coordinates resolved to
  a stable geometry reference, not to a triangle index.
- Owns crisp edge rendering. CAD looks like CAD because of the lines, not the
  shading; mesh silhouettes alone read as "3D viewer", not "CAD".

### `@bezier/ui`: React components

Viewport chrome, feature tree, property panels, gizmos, sketch tools. Presentation
and interaction only; no geometry logic. Where the feel of a polished commercial modeller is earned.

### `apps/studio`: the shell

Vite app. Routing, layout, document lifecycle, persistence wiring, worker setup.
Thin by design, it assembles packages, it does not implement.

## Consequences

### Positive

- Both risky dependencies are isolated to one package each. Replacing `occt-wasm`
  with a self-maintained OCCT build is a contained rewrite.
- LGPL obligations live in exactly two known places.
- `core` is testable without a browser, which matters because it holds the logic
  most likely to be subtly wrong.
- The UI can be iterated on hard, which it must be, without risking geometry.

### Negative / accepted

- More ceremony than a single package. Justified: the boundaries are the thing
  that keeps a project this size tractable, especially with contributors.
- Type definitions get restated at each boundary rather than shared. Deliberate -
  it is what stops kernel concepts leaking upward.
- Worker boundaries mean async everywhere and structured-clone-friendly payloads.

## Desktop

Mac, Windows, and Linux desktop builds are a stated goal. See
[ADR 0006](0006-desktop-packaging.md). The architecture above is unchanged by it:
desktop wraps the same web app, and only `apps/studio`'s persistence layer varies.
