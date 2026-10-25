# @bezier/sim

Structural simulation for the Simulation workspace. Pure TypeScript, no
dependencies, no DOM, it runs in a Web Worker in the browser and in the
desktop webview alike.

Units: mm, N, MPa, t, s, the consistent set structural FEA uses. Geometry
arrives in mm from the kernel and stress comes out directly in MPa.

At a glance

| | |
| --- | --- |
| **Layer** | Structural simulation: voxel grid, matrix-free solve, results. Pure TypeScript, no dependencies |
| **Depends on** | Nothing in the workspace |
| **Used by** | `apps/studio` (in a Web Worker) |
| **State** | Phase 1 is built (static stress, shape optimisation), and steady thermal conduction from phase 3 (`thermal.ts`); the rest of phases 2 to 4 is designed, not built ([`docs/simulation/ARCHITECTURE.md`](../../docs/simulation/ARCHITECTURE.md)) |
| **Tests** | 2 files, checked against hand calculations (bar in tension, cantilever band, linear conduction, P·L/kA, heat balance with a film) |
| **Explained in** | [How it works: simulation and lessons](../../docs/how-it-works/07-simulation-and-lessons.md) |


## Pipeline

1. **Voxelise** the rebuilt body's display mesh (`voxel.ts`). Solid by ray
   parity per column; every exposed voxel side is tagged with the nearest
   B-Rep face, so loads and constraints placed on `F:extrude-1:end` land on
   exactly that face's voxels.
2. **Solve** small-strain linear elasticity on the grid (`solve.ts`). Every
   element is the same trilinear hexahedron, so there is one element matrix
   and the solve is matrix-free: preconditioned conjugate gradient with
   element-by-element products. No global matrix is ever stored.
3. **Recover** von Mises stress, displacement and safety factor (`results.ts`)
   and sample them trilinearly at the display mesh's vertices, so the heatmap
   is drawn on the smooth B-Rep tessellation, not on stair-stepped voxels.
4. **Optimise** (`simp.ts`): SIMP with a density filter and optimality-criteria
   update on the same grid, keeping loaded and fixed faces as non-design.

## Why voxels

A tetrahedral mesher that fits a browser does not exist under a licence this
project can ship (Netgen is LGPL and native; Gmsh is GPL; TetGen is AGPL). A
voxel grid is robust for any solid, makes the element matrix a constant, and is
the grid SIMP works on anyway. Accuracy at curved boundaries is the price;
`docs/simulation/ARCHITECTURE.md` describes the native tetrahedral path that
removes it on the desktop build.
