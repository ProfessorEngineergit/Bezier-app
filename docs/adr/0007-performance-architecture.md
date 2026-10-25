# ADR 0007: Performance architecture

- **Status:** Accepted
- **Date:** 2026-08-05

## Context

The product promise is the feel of a polished commercial modeller. That is a performance claim before it
is a design claim, and performance claims made late are never met, the decisions
that determine whether an app feels instant are structural, and they get baked in
during the first month.

The temptation is to optimise the geometry kernel. That is the wrong target.

## The central insight

What makes CAD feel fast is not kernel throughput.

A user's sense of speed is dominated by the paths they touch hundreds of times a
minute, moving the camera, hovering an edge, dragging a dimension, none of which
involve the kernel at all. The kernel runs on the path they touch a few times a
minute, where 200 ms is invisible if the UI stays alive.

Optimising the wrong one is how tools end up with a fast kernel and a slow feel.

## Decision

Treat the application as five hot paths with five different budgets, and let
the architecture follow from them.

| # | Path | Budget | Runs on | Kernel involved |
| --- | --- | --- | --- | --- |
| A | Camera orbit / pan / zoom | **8 ms** (120 fps) | Main, rAF | No |
| B | Hover / selection highlight | **8 ms** | Main | No |
| C | Sketch drag (constraint solve) | **16 ms** | Main | No |
| D | Parameter change → rebuild | **100 ms** typical | Worker | Yes |
| E | Cold load → interactive | **1 s** shell, 3 s kernel | — | Lazy |

Everything below follows from that table.

### A: The render loop never touches React

The single most common way to make a Three.js + React application slow is to let
React re-render on camera movement. Sixty state updates a second through a
reconciler is a guaranteed dropped frame.

**Rule: the viewport owns its own `requestAnimationFrame` loop and its own scene
state.** Camera position, hover highlight, and selection are pushed into it
imperatively. React renders the chrome around the viewport and is not involved in
a frame.

React state changes when the *document* changes. Not when the camera moves.

### B: Picking is CPU-side, over a BVH

The obvious approach is GPU picking: render face ids to a buffer and read the
pixel under the cursor. It is also wrong here, because `readPixels` is a
synchronous GPU stall, it forces the CPU to wait for the pipeline to drain,
which costs far more than the 8 ms budget on some drivers.

**Rule: build a bounding-volume hierarchy over the tessellated mesh and raycast
on the CPU.** It is predictable, it has no driver variance, it works without a
GPU readback, and `Mesh.triangleFaces` already carries the face id per triangle,
so a hit resolves straight to a stable reference.

The BVH is rebuilt with the mesh, in the worker, and transferred with it.

### C: The solver stays on the main thread, and warm-starts

planegcs is 496 KB and fast. Putting it in a worker would add a message round trip
to every mouse move during a drag, the opposite of the goal.

**Rule: solve synchronously on the main thread, seeded from the previous
solution.** Warm-starting is not an optimisation here, it is a correctness
property: a numeric solver started from scratch can converge to a *different*
valid answer, which makes a dragged sketch jump instead of following the cursor.

If measurement later shows a sketch size where this misses 16 ms, the answer is to
throttle to one solve per frame, not to move it off-thread.

### D: Rebuild is incremental and content-addressed

Replaying the whole history on every parameter change is the naive approach, and
it makes editing feel progressively worse as a model grows, the exact opposite of
what a user expects.

**Rule: every feature's output is cached under a content hash of its parameters
plus the hash of its input.** Changing feature 5 of 10 replays 5 through 10; 1
through 4 are cache hits. Changing a fillet radius at the end of a long history
costs one operation.

This also gives undo/redo almost for free: stepping back usually lands on cached
state.

### E: Nothing waits for the kernel

4.7 MB brotli of WebAssembly must not sit between the user and a usable window.

Rule: the shell renders without the kernel. The kernel is loaded lazily,
compiled with `instantiateStreaming`, and only awaited when geometry is actually
needed. Opening the app, browsing documents, and reading the feature tree all work
before it arrives.

### Crossing the worker boundary: transfer, never clone

A tessellated mesh is megabytes of `Float32Array`. Structured-cloning it on every
rebuild would copy it twice and land it in the wrong generation of the GC heap.

Rule: all geometry payloads cross the worker boundary as Transferables. Every
`postMessage` carrying a typed array declares it, and the buffers are treated as
moved, never touched again on the sending side.

`SharedArrayBuffer` would be faster still, but it requires COOP/COEP headers,
which constrain hosting and break embedding. Deferred as an opt-in, not adopted.

### Allocation discipline in hot paths

Rule: paths A, B, and C allocate nothing per frame. No temporary vectors, no
array literals, no closures created inside a loop. Scratch objects are hoisted and
reused. This is unremarkable in game engines and unusual in web apps, and it is
most of the difference between 120 fps and 60 fps with jank.

Outside those three paths, write normal, readable code. Premature micro-optimising
of cold paths is how a codebase becomes unmaintainable for no gain.

## Consequences

### Positive

- The budgets are testable. Each becomes a benchmark, and a regression is a failed
  CI run rather than a bug report months later.
- The split is structural, so it cannot quietly erode.
- Incremental rebuild means model complexity does not degrade editing feel.

### Negative / accepted

- The imperative renderer boundary is unidiomatic React and will surprise
  contributors. It needs to be stated loudly in `packages/renderer/README.md` and
  enforced in review.
- A CPU BVH costs memory proportional to triangle count, and must be rebuilt when
  the mesh changes.
- Content-addressed caching needs a stable hash of feature parameters, which
  means parameter objects must be canonically serialisable. That is a real
  constraint on how features are defined (see [ADR 0008](0008-feature-registry.md)).
- Transferables mean the sender loses its buffers. Accidentally reusing one is a
  runtime error, and an easy mistake to make.

## Budgets are enforced, not aspirational

Numbers in a document decay. These get CI checks:

- **Bundle size budget** on the app shell, failing the build when exceeded.
- **Benchmarks** for paths B, C, and D, run on a fixed corpus.
- **A cold-load measurement** against the built app.

See [`../PERFORMANCE.md`](../performance.md) for the current numbers and how to
measure them.

## Camera projection arrival (2026-10-05)

The earlier flight interpolated the pose in perspective and switched to the parallel
camera on arrival. Matching scale at the target plane did not preserve the size of
nearer faces, which visibly shrank a second time after Space.

[`tools/spikes/projection-arrival.ts`](../../tools/spikes/projection-arrival.ts) projects a
40 mm foreground span at depth 30 mm with a target 100 mm away. Normalizing the
perspective projection matrix by that distance allows continuous interpolation to
the matching orthographic matrix. The final camera handover changes projected width
by less than 1e-9, verified in Chromium and WebKit in
[`../../e2e/modeling/datum-line.spec.ts`](../../e2e/modeling/datum-line.spec.ts). Both cameras remain real
Three.js cameras; interpolation reuses their matrices and allocates nothing per frame.
User navigation cancels a flight instead of having its pose overwritten on the next frame.

## Open questions

- What is the real sketch size where a main-thread solve misses 16 ms? Unmeasured.
- Does a CPU BVH raycast hold 8 ms on a 500k-triangle model, or do we need a
  spatial hash over screen space for hover specifically?
- Is a second worker worth it for tessellation, so a rebuild can stream coarse
  geometry first and refine? Probably, but measure before building it.
- WebGPU: how much of the renderer needs to change, and when is the browser floor
  acceptable?
