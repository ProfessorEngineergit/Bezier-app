# 5 · The viewport

The viewport is Three.js (and, for the Visualize workspace, Three's WebGPU renderer, which
falls back to WebGL2 where WebGPU is not there). The code that matters most is not the
drawing but three decisions: **what a click means, when to draw, and how to stay fast on
a model that is too big.**

## A click means a name, not a triangle

When you click a face the answer is a `StableRef` ([page 3](03-stable-references.md)),
never a triangle index, which means nothing once the model rebuilds. The mesh carries
`triangleFaces`, a map from every triangle to the face it came from.

- **Picking is a CPU raycast over a BVH**, not a GPU id buffer (`bvh.ts`,
  [ADR 0007](../adr/0007-performance-architecture.md)): reading a pixel back blocks until
  the GPU drains and can cost more than the whole 8 ms hover budget. For a large mesh the
  tree is built on another thread (`off-thread.ts`).
- **An edge is picked as a seam** (`picking.ts`, `outline.ts`). The engine's edge data is
  drawing data with no identity. So a ring of rays is cast around the cursor: one face
  means you are on a face, two faces within a few pixels means you are on the seam between
  them, and that seam *is* `E(faceA|faceB)`. The naming scheme gives the answer directly
  instead of it being reconstructed from geometry.

## Draw only when the picture is out of date

The loop used to draw every frame whether or not anything had changed: a still model,
or one behind the start page, redrawn 60 to 120 times a second, which kept about a fifth
of a core and of the GPU busy on the Mac app, measured. Now (`redraw.ts`) a frame is drawn
when the camera moves, when something calls the viewport, or while something on screen
animates, and never while the canvas is off screen.

## Stay fast on a model that is too big

A large assembly (the Voron printer is four million triangles) can be drawn at full
quality when still but not sixty times a second while the camera moves. Everything
adaptive answers to **one measured number**, how late frames are arriving
(`frame-budget.ts`, smoothed over about ten frames), so it covers a heavy model, a slow
GPU, another program rendering, a laptop on battery, without recognising any of them:

| What | File |
| --- | --- |
| While the view moves, draw at a lower resolution (down to half a pixel per point) and leave outlines out; climb back when frames are on time | `interaction-quality.ts` |
| Draw each solid as finely as its size on screen asks; coarse meshes made in the background; finer ones for what the camera is close to, within a triangle budget | `lod-body.ts`, `solid-lod.ts` |
| Whether background work may run | `background-work.ts` |
| The ground grid's cell size follows the viewing distance, one spacing for the whole plane | `grid-lod.ts` |

The budgets, and what they measured: 8 ms for camera movement and 8 ms for hover and
picking. On 2026-10-02 the camera cost under 2 ms of CPU up to 204,800 triangles and
picking 0.1 to 0.2 ms ([`benchmarks.md`](../benchmarks.md)).

## One thing about the first frame

Right after a model appears, a web view (WebKit in particular) may not have presented its
first frame yet, so a click can resolve against the picture before. The tests wait two
animation frames before they click for that reason (`afterFrames` in `e2e/app.ts`).

## Where to look

`packages/renderer/src/`, [ADR 0007](../adr/0007-performance-architecture.md),
[`performance.md`](../performance.md). Camera *feel* (inertia, the way a rotation settles)
is in `packages/ui`, not here.
