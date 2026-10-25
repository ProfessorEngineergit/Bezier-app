# Roadmap

The order things get built, and why that order.

No dates. Dates on a project like this are fiction, and the milestones are gated
on results rather than on time.

> Where it stands now (2026-10-02). The milestone notes below were written while M0 was in
> progress and have not been rewritten; [`platforms.md`](platforms.md) says where it stands on each system.
> What can be said from it without re-reading the milestones: a history of many features and
> several bodies works, with undo and redo and a rebuild of only what changed
> ([`benchmarks.md`](benchmarks.md): 35 ms against 617 ms at 40 steps); desktop apps exist for macOS,
> Windows and Linux; sketches can sit on any flat surface ([ADR 0013](adr/0013-sketch-areas-and-surfaces.md));
> and drawings, Visualize, simulation and lessons exist, which this roadmap does not list. **The
> constraint solver is still the open item**: the app runs on a stand-in, and typed dimensions drive the
> geometry while constraints are kept but not solved. Which milestone gates have passed is the
> maintainer's call, and this note does not make it.

---

## The strategy in one paragraph

Win one narrow thing completely before widening. The narrow thing is **designing
3D-printable enclosures in a browser**. It is a real need, it is underserved, it
is small enough to finish, and it exercises exactly the capabilities, sketching,
extruding, shelling, holes, fillets, that generalise afterwards.

The graveyard is full of open CAD projects that tried to be Fusion on day one.
Two of them died recently: Ondsel, after raising money, and Fornjot, archived in 2026.

---

## M0: Vertical slice

Prove the whole chain works. Sketch a rectangle → constrain it → extrude →
fillet an edge → export STEP and STL → save and reload, all in the browser, all
local.


Done so far: the geometry kernel against real OCCT, the
stable-reference naming scheme, the feature registry, and the append-only journal
with crash-recovery and undo. The face-hash question that could have
invalidated the architecture is answered and recorded in
[ADR 0001](adr/0001-geometry-kernel.md).

Since then: the viewport (Three.js, CPU BVH picking that resolves a click to
a `StableRef`), schema-generated property panels, and the app shell wiring
kernel, solver, rebuild, and storage together. Verified in a real browser: a
solid draws with crisp edges, a click resolves to `F:extrude-1:end`, a click on a
seam resolves to `E(…|…)`, and a document survives a page reload through OPFS.

Browser tests now exist (`e2e/`, Playwright, Chromium and WebKit in CI), and
they cover the acceptance test's step 9 end to end. They found a fourth bug on
their first run.

The constraint solver, the last open part of M0, landed on 13 October 2026:
`createSolver()` loads planegcs and `gcs-solver.ts` translates our sketch to it and
back. The stand-in that places points where they were drawn stays as the fallback
for a window that cannot load the solver's WebAssembly.

The acceptance test that matters: change the extrude height and the fillet stays
on the edge the user picked. That single behaviour is the product thesis.

Also answers two open questions that could still change the architecture: are
OCCT face hashes stable across a rebuild, and can we build OCCT to WebAssembly
ourselves if we have to.

Gate: all acceptance steps pass in Chrome, Firefox, and Safari.

---

## M1: Real models

A single fillet on a single extrusion is a demo. This is where it becomes a tool.

- Multiple features in a history, in any order
- Multiple sketches on multiple planes, and sketching on a face
- Circles and arcs in sketches, with the constraints that go with them
- Cut and add extrudes, not just new bodies
- **Undo/redo** across everything
- Rebuild only what changed, rather than replaying from scratch every time
- Feature reordering, suppression, and rollback
- **Desktop builds**, macOS, Windows, Linux, via Tauri
  ([ADR 0006](adr/0006-desktop-packaging.md))

Gate: a real enclosure, a project box with a lid, can be modelled, edited,
and re-edited without losing work.

---

## M2: References that survive

The hard one, and the reason the project can exist next to free alternatives.

Stable geometry references have to hold up under editing that changes
topology: a fillet still attached to the right edge after the face it was on has
been split by a new pocket.

- Full evolution threading across every operation type
- Edge and vertex naming derived from faces
- Reporting when a reference cannot survive, with a name the
  user recognises, and a way to re-pick, rather than a silent wrong answer
- A large regression corpus of edit sequences that must not break

Realistic expectation: nobody has fully solved this. The goal is to be *reliably* good enough and *always*
honest about it, a tool that says "I lost this reference, please re-pick" is far
better than one that silently fillets the wrong edge.

Gate: the regression corpus passes, and edits that cannot survive
are reported clearly instead of failing silently.

---

## M3: Enclosures, properly

The wedge, delivered. Everything here is chosen because it is what enclosure work
actually requires.

- **Shell** with per-face thickness
- **Holes**, counterbore, countersink, threaded, from a real fastener table
- **Screw bosses** and standoffs as a parameterised feature
- **Snap-fits** as a parameterised feature
- **Ribs** and gussets
- **Lids and mating parts**, split a body, add a lip, get a fit that works
- **Clearance and tolerance presets** for printing, the difference between a
  press fit and a sliding fit is one number, and the software should know it
- Import a reference model (a PCB, a component) and design around it
- 3MF export with units and metadata

Gate: someone who is not us designs, prints, and assembles a real enclosure
without asking us how.

---

## M4: The feel

Everything up to here makes it *work*. This makes it *good*, and this is where the
comparison to the best commercial tools is either earned or not.

- Snapping that guesses right, edges, midpoints, centres, and round numbers
- Direct manipulation: drag a face, drag a dimension, see it live
- Gizmos that are precise with a mouse and forgiving with a trackpad
- Sub-millimetre numeric input everywhere, always keyboard-first
- Sketch diagnostics presented as help, not as errors, *"these two constraints
  conflict, remove one"* with both highlighted
- Sub-frame hover and selection response
- Camera behaviour that feels physical
- Rendering polish: proper edges, ambient occlusion, materials that read as solid
- Full keyboard reachability and screen-reader labelling

Gate: someone used to a commercial modeller tries it and does not immediately want to go back.

---

## Beyond

Not committed, in rough order of likelihood:

- Assemblies and a 3D constraint solver ([ADR 0002](adr/0002-constraint-solver.md)
  discusses the options)
- Drawings and dimensioned exports
- Configurations, one model, several sizes
- Collaboration, if and only if it can be done without breaking local-first
- A plugin API
- Sheet metal, surfacing, CAM, each a project in its own right

---

## What is not on this roadmap

- **Cloud storage as the default.** Local-first is the architecture, not a mode.
  Any sync is opt-in and additive.
- **An account requirement.** The app opens and works.
- **Telemetry by default.** Opt-in if ever, and off in desktop builds.
- **Breadth at the cost of coherence.** Fewer tools that fit together beat many that don't.

---

## The risk that is not technical

Open-source CAD has seen funded efforts with good software and real enthusiasm
among hobbyists fail to turn that into income. The same risk applies here. The
licence ([ADR 0016](adr/0016-open-source.md)) pays for nothing; a hosted version
and donations may. What people would pay for is an open question worth answering
before much effort goes into it.

