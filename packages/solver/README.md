# @bezier/solver

The sketching layer. Wraps [planegcs](https://github.com/Salusoft89/planegcs) -
FreeCAD's 2D geometric constraint solver, compiled to WebAssembly.

## What a constraint solver is, if you have not met one

At a glance

| | |
| --- | --- |
| **Layer** | The sketching layer: the 2D constraint solver behind our own typed vocabulary |
| **Depends on** | `@salusoft89/planegcs`. **The only package that may import it** |
| **Used by** | `core`, `renderer`, `ui`, `apps/studio`, `bench` |
| **State** | Written and wired: `createSolver()` loads planegcs and solves. The app's stand-in is only the fallback for a window that cannot load the WebAssembly |
| **Tests** | 1 file, 27 tests: one fixture per constraint kind, degrees of freedom, conflicts, redundancy, arcs |
| **Read first** | `src/types.ts` |


You do not draw a rectangle by placing four lines at exact coordinates. You draw
four rough lines and then *state facts about them*: these two are parallel, these
two meet at a corner, this one is 40 mm long, this one is horizontal. The solver
turns that pile of facts into actual coordinates.

Change 40 mm to 50 mm and everything rearranges to stay consistent. That is what
makes CAD parametric, and it is why a sketch is not a drawing.

## Why this package exists

planegcs speaks in flat integer parameter arrays and its own numeric ids. This
package gives it a typed vocabulary with our own stable string ids, so the rest of
the app can say `{ type: 'perpendicular', a: 'line-1', b: 'line-2' }` and mean it.

**Rule: no other package may import `@salusoft89/planegcs`.**
([ADR 0004](../../docs/adr/0004-app-architecture.md))

## The part worth getting right: diagnostics

planegcs can tell us more than "solved" or "failed". It reports:

- **Degrees of freedom**, how under-constrained the sketch still is
- **Conflicting constraints**, which specific constraints contradict each other
- **Redundant constraints**, which ones say something already implied

Most hobby CAD tools do not surface this, because their solvers cannot produce it.
Ours can, and mapping it back to the user's own constraints is one of the clearest
places where this tool can feel obviously better than the free alternatives.

An over-constrained sketch should say *"the 40 mm width and this coincidence
can't both hold, remove one"*, with both highlighted. Not turn red.

## Known limits, inherited from upstream

- **2D only.** No assembly mates or 3D sketches. Deliberate, see
  [ADR 0002](../../docs/adr/0002-constraint-solver.md).
- **Non-driving (reference) dimensions are buggy upstream** for several constraint
  types. Out of scope until M2+.

## Status

Types defined. No implementation yet, lands in the vertical slice.

## Starting on the implementation

Two files are already here for it:

- **`solver.test.ts`**, the verification suite. It drives `createSolver()`
  through the public `ConstraintSolver` interface with one fixture per
  constraint kind (plus degrees-of-freedom, conflicting, redundant, and the
  two-circle-intersection case that checks a drag stays on the branch it
  started near), and the arcs.
- **`gcs-solver.ts`**, the translation: every point first, then lines, circles and
  arcs, then constraints; planegcs's ids mapped back to ours, so a conflict names
  the constraint the user made.

Fastest loop: `pnpm test:watch`, then press `p` and type `solver` to scope it
to this package. `pnpm exec vitest run packages/solver` for a single pass.

## Licensing note

planegcs is LGPL without a linking exception. `planegcs.wasm` therefore ships
as a separate file with a configurable URL, never inlined. This is a licence
requirement. See [ADR 0003](../../docs/adr/0003-license-model.md).
