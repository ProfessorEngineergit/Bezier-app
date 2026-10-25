# Architecture decision records

Why each major decision was made, written when it was made. **Numbered, appended to, never
deleted**: a decision that changes gets a new record that says so, and the old one stays, as
the account of what was true then. Where one has been narrowed by a later one, it is noted below.

New decision: copy the shape of the latest record, take the next number, and discuss it in an
issue first. A decision that touches a compatibility
promise (the stable-reference text format, the declared face tags, the saved-document format)
needs one.

| | Decision | In one line |
| --- | --- | --- |
| [0001](0001-geometry-kernel.md) | Geometry kernel: OCCT via `occt-wasm` | Open CASCADE in WebAssembly; includes the experiment showing face hashes are not stable |
| [0002](0002-constraint-solver.md) | 2D constraint solver: planegcs | FreeCAD's solver, behind our own interface |
| [0003](0003-license-model.md) | Licence model | Free for people, companies pay, with a CLA; narrowed by 0010, **superseded by 0016** |
| [0004](0004-app-architecture.md) | Application architecture and package boundaries | Five layers, downward only, enforced by lint |
| [0005](0005-local-first-storage.md) | Local-first storage and document format | Everything on the machine; the zip document format it describes is **not** what was built, see [how it works, page 4](../how-it-works/04-storage.md) |
| [0006](0006-desktop-packaging.md) | Desktop packaging: Tauri 2 | The same app in the system's web view on macOS, Windows and Linux |
| [0007](0007-performance-architecture.md) | Performance architecture | The budgets, and what is allowed on the hot paths |
| [0008](0008-feature-registry.md) | Features are modules in a registry | Adding a feature is one file; no `switch` on feature type elsewhere |
| [0009](0009-durability.md) | Durability, and why it is the same design as speed and transparency | An append-only journal, written before it is applied |
| [0010](0010-no-fork-license.md) | Polyform Strict: no forking, for now | Source-available, not open source; **superseded by 0016** |
| [0011](0011-simulation-workspace.md) | Simulation workspace on a voxel solver of our own | Static stress first; the rest designed, not built |
| [0012](0012-multi-body.md) | Several bodies are several solids in one shape | |
| [0013](0013-sketch-areas-and-surfaces.md) | A sketch is a set of areas, on any flat surface | |
| [0014](0014-document-state-beyond-features.md) | What a document holds besides its features | Variables, expressions, folders, and how it stays fast |
| [0015](0015-live-collaboration.md) | Live collaboration | The server orders edits, every device builds the model |
| [0016](0016-open-source.md) | Open source: GPL, Affero GPL for the servers, no CLA | Anyone may use, change and pass it on; what is passed on stays open; the name is not part of it |
| [0017](0017-loft-and-sweep.md) | Loft and Sweep build from sketches, and name their faces as extrude does | Two sketches for a loft, a profile and a joined path for a sweep |
