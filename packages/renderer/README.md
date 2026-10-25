# @bezier/renderer

The viewport. Three.js today, structured so that moving to WebGPU is a swap of the
backend rather than a rewrite.

## Two things this package must get right

At a glance

| | |
| --- | --- |
| **Layer** | The viewport: Three.js drawing, edges, picking, adaptive quality |
| **Depends on** | `@bezier/core`, `kernel`, `solver`; `three` |
| **Used by** | `ui`, `apps/studio` |
| **Tests** | 19 files, 2,003 lines (headless: the BVH, picking, framing, the adaptive budgets) |
| **Read first** | `src/picking.ts`, `src/bvh.ts`, `src/redraw.ts`, `src/interaction-quality.ts` |
| **Explained in** | [How it works: the viewport](../../docs/how-it-works/05-viewport.md) |


### Edges, not just shading

CAD looks like CAD because of the lines. The same solid rendered as a shaded mesh
reads as "3D viewer"; rendered with crisp silhouettes and sharp feature edges it
reads as "engineering tool". The difference is almost entirely visual polish, and
almost entirely why professional tools feel professional.

So edges are extracted from the kernel as real curves and drawn as first-class
geometry, not derived from mesh normals at render time.

### Picking returns *meaning*, not triangles

When the user clicks a face, the answer must be a `StableRef` from `@bezier/core`
- "the face made by `extrude-1`, side 3", not a triangle index. A triangle index
is meaningless the moment the model rebuilds.

This is why the `Mesh` type carries `triangleFaces`: it maps every triangle back to
the face of the solid it came from, so a hit test can be resolved into something
worth storing.

Two consequences worth knowing before reading the code:

Picking is a CPU raycast over a BVH, not a GPU id buffer ([ADR 0007](../../docs/adr/0007-performance-architecture.md)).
Reading a pixel back means `readPixels`, which blocks until the GPU pipeline
drains and can cost more than the whole 8 ms hover budget on some drivers. See
`bvh.ts`.

An edge is picked as a seam, not as a line. `EdgeSet` is drawing data with no
identity attached, so there is nothing in it to map back to a reference. Instead a
ring of rays is cast around the cursor: one face means the user is on a face, two
distinct faces within a few pixels means the cursor is on the seam between them -
and that seam *is* `E(faceA|faceB)`. The naming scheme produces the answer
directly rather than it being reconstructed from geometry. See `picking.ts`.

## Not here

Camera *interaction* feel, orbit inertia, zoom-to-cursor, the way a rotation
settles, is a UX concern and lives in `@bezier/ui`. This package owns the scene
and how it is drawn, not how it is driven.

## Status

Built, used every day, and measured: the BVH and raycast, mesh and edge conversion, resolving a hit to a
`StableRef`, highlight painting, the redraw-on-demand loop, adaptive resolution and level of detail, the
presentation renderer for Visualize. Camera cost stays under 2 ms and picking under 0.2 ms up to 204,800
triangles ([`docs/benchmarks.md`](../../docs/benchmarks.md)). It is exercised in real browsers by the
end-to-end suite and in the packaged apps.

An earlier version of this page said "nothing here has drawn a pixel"; that stopped being true long ago.
