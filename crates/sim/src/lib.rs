//! Native simulation core for the desktop build.
//!
//! Units: millimetre, newton, megapascal, tonne, second.
//!
//! Mirrors the study model of `packages/sim` (the TypeScript solver in a Web Worker) and hosts
//! native solvers for studies beyond the voxel solver. Linked into `apps/desktop/src-tauri` and
//! driven over Tauri IPC; see `docs/simulation/ARCHITECTURE.md`.

pub mod model;
