# ADR 0002: 2D constraint solver: planegcs

- **Status:** Accepted
- **Date:** 2026-08-04

## Context

A parametric CAD tool needs a sketcher where the user states *relationships*
("this edge is 40 mm", "these two lines are perpendicular", "this circle is
concentric with that one") and the solver figures out the coordinates. Writing a
geometric constraint solver from scratch is a multi-year research project.

Two mature free options exist: FreeCAD's planegcs and SolveSpace's solver.

## Decision

Use planegcs, via [`@salusoft89/planegcs`](https://github.com/Salusoft89/planegcs)
- a WebAssembly port of FreeCAD's 2D geometric constraint solver.

Wrap it behind `@bezier/solver`, which owns the typed constraint vocabulary. No
other package imports `@salusoft89/planegcs` directly.

## Rationale

### Why not SolveSpace: the licence is a hard block

SolveSpace is GPL-3.0-or-later. Linking it would force the entire application
under GPL-3.0, destroying the commercial model in
[ADR 0003](0003-license-model.md). This is not a grey area to be managed
carefully; it is disqualifying.

Dune 3D is the proof. It pairs the SolveSpace solver with the OCCT kernel and
is consequently GPL-3.0 itself. That is precisely the outcome we are avoiding.

SolveSpace's solver is technically excellent and, unlike planegcs, genuinely
3D, which we give up. That cost is discussed under Consequences.

### Why planegcs is a good choice on the merits, not just by elimination

- **LGPL-2.1 / LGPL-2.0-or-later**, usable, with obligations we can meet
  (see [ADR 0003](0003-license-model.md)).
- **496 KB `.wasm`**, negligible beside the 21 MB kernel.
- **Battle-tested.** It is the solver behind every FreeCAD sketch ever drawn.
- **JSON-object API** that maps directly onto a serialisable document model:

  ```ts
  { id: '1', type: 'point', x: 10, y: 10, fixed: false }
  { id: '3', type: 'p2p_coincident', p1_id: '1', p2_id: '2' }
  ```

- **Complete TypeScript annotations**, hand-written.
- **Full diagnostics**, the finding that raised our confidence materially:

  ```ts
  dof(): number
  get_gcs_conflicting_constraints(): string[]          // mapped to OUR ids
  get_gcs_redundant_constraints(): string[]
  get_gcs_partially_redundant_constraints(): string[]
  ```

  Solve outcomes are a typed enum (`Success | Converged | Failed |
  SuccessfulSolutionInvalid`) and the numeric algorithm (DogLeg, Levenberg–
  Marquardt, BFGS, SQP) is selectable.

  This is what lets us build a sketcher that says *"these two constraints
  conflict, remove one"* instead of turning the sketch red. Most hobby CAD
  cannot do this because it does not have the diagnostics. We get them free, and
  surfacing them well is a real UX differentiator.

- **Reproducible build.** The repo builds its own `.wasm` from vendored FreeCAD
  C++ via `npm run build:wasm`, so if the wrapper stalls we can maintain it.

## Consequences

### Positive

- Constraint solving is solved, with quality diagnostics, at 496 KB.
- The JSON API means sketch documents are naturally serialisable.

### Negative / accepted

- **2D only.** No assembly mates, no 3D sketches, no direct-manipulation drags on
  solid faces. Acceptable: the wedge is single-part enclosures, where a good
  planar sketcher plus a feature history covers the work. Deferred deliberately.
- **Non-driving constraints are buggy upstream.** `CircleDiameter`, `ArcDiameter`,
  `C2CDistance`, `C2LDistance`, `P2CDistance`, and `ArcLength` are documented as
  misbehaving when set to non-driving. **Reference/measurement dimensions are
  therefore out of scope for M0–M1.**
- **LGPL with no linking exception** (unlike OCCT). This drives a real
  architectural constraint: `planegcs.wasm` ships as a separate runtime artifact,
  never inlined into a JS bundle. See [ADR 0003](0003-license-model.md).
- **Single-maintainer wrapper**, mitigated by the reproducible in-repo build.

### The 3D constraint story, deferred explicitly

When assemblies eventually matter, the options are, in order of preference:

1. **Stay in 2D longer than you think.** Most "3D constraints" in part modelling
   are sketch-on-face plus feature parameters. This goes a long way.
2. **Write our own 3D solver.** A Newton / Levenberg–Marquardt solver over
   rigid-body DOFs is a known, bounded problem. Keeps it under our licence.
3. **Evaluate OndselSolver** (FreeCAD 1.0's assembly solver), check its exact
   licence before assuming it is usable.

Deliberately not an option: adopting SolveSpace's 3D solver, for the reason above.

## Open questions

- Which upstream FreeCAD revision is vendored? Pin it and record the SHA.
- Does the wrapper support warm-start / incremental solving during a drag, or does
  each solve rebuild the system? This directly bounds drag interactivity (M4).
- At what sketch size does an interactive solve stop feeling instant? Measure.
- Reconcile the licence version: npm says LGPL-2.0-or-later, the repo says
  LGPL-2.1. Pin it down for `docs/legal/third-party-licenses.md`.
