# ADR 0013: A sketch is a set of areas, on any flat surface

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

A sketch could be extruded only when it was one single closed outline. Two
rectangles in one sketch, a rectangle with a circle inside it, or two shapes
that overlap were all refused. Worse, pressing Sketch reopened the last sketch
nothing had been built from, so a second drawing landed inside the first and
made both unbuildable. Only the newest unused sketch was shown, so an earlier
one could not be reached again. And a sketch could only stand on the three
origin planes, while the reference flow starts a
sketch on a planar face as often as on a plane.

## Decision

### Areas, not outlines

What an extrude consumes is an area: a closed region of the drawing, with
holes. `rebuild/regions.ts` computes them from the planar arrangement of the
sketch's lines, arcs and circles:

1. every curve is split where it meets another, so crossings become corners
2. strays that bound nothing are dropped
3. walking the graph, always turning the same way, traces every face once
4. counter-clockwise faces are areas; clockwise ones are the outline of a whole
   connected drawing and become a hole in the smallest area around them

A circle nothing crosses stays one circle segment, so cylinders keep the one
side face saved documents name. Each area has a key, the sorted ids of the
pieces of its outline (`l1+l2+l3+l4`), which survives dimension changes.

Extrude and Revolve take a `regions` parameter: the keys of the areas they use.
Empty means all of them, which is also what every document saved before this
reads as, so old files rebuild unchanged. Several areas extrude as one feature;
areas that share an edge fuse into one part, separate ones stay separate parts.
The kernel builds holes into the face (`addHolesInFace`), in either winding.

The UI reads the same regions (`@bezier/ui` `sketchAreas`, the renderer's fill,
`pickSketchArea`), so what is offered on screen is exactly what gets built.

### Sketches on show, and starting a new one

Sketch always starts a new sketch; Items → Edit reopens an existing one.
Every sketch with an unused area stays on show, each on its own plane
(`visible-sketch.ts` `shownSketches`): an area is used once a feature that built
names it, or names none. Clicking an area offers the extrude; Shift-click adds
more areas of the same sketch to the offer.

### Sketches on faces

A sketch has an optional `face` parameter. When set, its plane is read from that
face on every rebuild (`kernel.facePlane`), so the sketch follows the face when
the part changes. The basis is built from the face's plane alone
(`faceSketchBasis`: origin is the world origin dropped onto the plane, x is world
X laid onto it), so a face that grows does not move what was drawn on it.
Selecting a face and pressing Sketch, or clicking a face while choosing a plane,
starts a face sketch. An extrude from a face sketch adds to that body by default.

### Constraints in the UI

Constraints are applied to the selection from a contextual bar
(`ConstraintBar.tsx`): only the ones that fit the selection are shown. Typed
lengths and radii are stored as `distance` and `radius` constraints. After every
change the draft is solved (`solveInto`); a contradiction is refused and the
constraints it contradicts are named. Each constraint shows a mark that removes
it. The app is solver-agnostic: with the stand-in solver constraints are kept
and the app says they take effect once the solver is in.

## Consequences

- Area keys are ids of pieces, so a topology change (a new line crossing an
  area) gives new keys. An extrude that named an area that no longer exists
  reports it instead of guessing.
- Area sizes for ordering use the sampled outline; the loops handed to the
  kernel are exact.
- A new sketch after an extrude starts on the new part's top face, because the
  top is selected. Click empty space first to start on an origin plane.
- The rebuild cache now hashes structured parameters (the sketch drawing) by
  content. It hashed them as `[object Object]`, so an edited sketch's extrude
  came back unchanged from the cache.
