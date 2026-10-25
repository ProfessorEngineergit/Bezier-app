# ADR 0011: Simulation workspace on a voxel solver of our own

- **Status:** Accepted for phase 1; phases 2–4 proposed
- **Date:** 2026-09-10

## Context

The masterplan files simulation under P5h and asks for an ADR before any work.
The maintainer asked for a Simulation workspace alongside Design, familiar to
Fusion users, running efficiently, with a licensing path that keeps the product
commercially viable.

Three constraints decide the shape:

1. **It must run where the app runs**, the browser build and the desktop
   webview, without a native toolchain.
2. **No tetrahedral mesher ships in a browser under a licence we can use.**
   Netgen is LGPL and native; Gmsh is GPL; TetGen is AGPL.
3. **References must survive edits.** A study that has to be rebuilt after
   every model change is not part of a parametric workflow.

## Decision

- Solve on a voxel grid generated from the kernel's display tessellation.
  Every element is the same hexahedron: one element matrix, a matrix-free
  preconditioned conjugate gradient, no global matrix, memory linear in the
  unknowns. SIMP shape optimisation reuses the grid and the solver.
- The solver is our own code (`packages/sim`, TypeScript, no dependencies),
  run in a Web Worker. A Rust twin (`crates/sim`) carries the same model for
  the desktop build's native path.
- Studies name faces by stable reference. Voxel sides are tagged with the
  nearest B-Rep face, so references resolve onto the grid on every solve.
- Results are sampled at the display mesh's vertices and drawn by a shader
  overlay on the kernel's own tessellation, the voxel staircase never reaches
  the screen.
- Heavier physics (nonlinear, contact, large tetrahedral meshes) goes native on
  the desktop only: Netgen dynamically linked, CalculiX as a separate process.

## Consequences

- Works today in both builds, with no licence exposure.
- Accuracy at curved boundaries is limited by voxel size, and the workspace
  says so on every result. The native tetrahedral path removes the limit.
- Fine meshes are slow until a multigrid preconditioner lands (phase 2).
- Studies live in local storage until they join the journal (phase 2); undo
  and project files do not carry them yet.

See [`docs/simulation/ARCHITECTURE.md`](../simulation/ARCHITECTURE.md).
