# ADR 0012: Several bodies are several solids in one shape

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

A document could hold exactly one body. `rebuild` carries one running shape
through the history, and Extrude and Revolve with the result "New" replaced it:
drawing a second box made the first one disappear. Move, Rotate and Copy already
worked on separate solids inside that shape, so a copied part could exist, but
nothing else knew about it: Shell failed on it, nothing listed it, and it could
not be hidden, removed or combined with anything.

Every CAD tool in the category lets a part be modelled as several bodies and then
joined, cut or kept apart. Without that, an assembly of two parts, a mould and its
core, or a lid next to its box cannot be drawn at all.

## Decision

**The document's body stays one shape. Each separate body is one solid inside
it.** The rebuild loop, the feature contract, the cache and the naming layer all
keep passing a single `ShapeId`, and nothing about saved documents changes except
one optional field.

- **New** puts the new solid beside the others (`kernel.compound`) instead of
  replacing them. Add and Cut fuse or cut against the whole shape, and
  reach only the solids the tool touches.
- **Shell** runs on the solid that owns the picked faces and puts it back beside
  the others (`withinOwningSolids` in `features/bodies.ts`).
- **Remove** (`remove-body`) takes bodies out as a step in the history. Removing
  the last one sets `RebuildOutput.cleared`, and later features start from an
  empty document.
- **Combine** (`combine`) joins, cuts or intersects a target body with tool
  bodies, optionally keeping the tools.
- **Hidden bodies** are saved in `DocumentMeta.hiddenBodies`, changed through the
  `setBodyVisible` journal operation, and left out of what the viewport draws.
  Export still writes every body.

A body is named by the names on its faces, like everything else. Its key is
the earliest feature, in history order, that named one of its faces, with `#2`,
`#3` for further pieces of a body a cut split apart (`rebuild/bodies.ts`). That
key survives fillets, shells, moves and joins, which is what a hidden body needs.

### Added the same day (2026-09-27, second pass)

- **Pull a face** (`face-extrude`) acts on the body the face belongs to only. It
  used to fuse with, or cut into, any part it reached.
- **Parts that meet are asked about.** After an extrude as a new body, a face
  pull, or a move, the app checks (`kernel.contact`) whether the part now touches
  or reaches into another, and offers Join, Cut (only when they overlap) or Keep
  separate. The answer is a Combine feature, or nothing.
- **Split** (`split-body`) cuts a body in two along an origin plane moved by an
  offset: the lid off an enclosure. Faces the plane crossed pass their name to
  both pieces.
- **Scale** (`scale`) grows or shrinks bodies about the middle of their bounds,
  with faces kept through `scaleWithHistory`.
- **Import** (`import-step`) brings a STEP file in as bodies; the file's text
  is stored in the feature. STL is refused: it is a mesh, not a solid.
- **Duplicate** (Cmd+D) is a Copy one body-width plus 10 mm to the side.
- **Names**: `DocumentMeta.bodyNames` and the `renameBody` operation.
- **Delete** removes whole selected bodies, or the selected history step.
- A failed feature now blocks only the features that depend on it
  (`rebuild.ts` `brokenDependency`), not everything after it.

## What the kernel was measured to do

Pinned in `packages/kernel/src/multi-body.test.ts`, against real OCCT:

- Fuse, cut, fillet and chamfer on a compound of three solids keep three solids,
  and report every face of the untouched solids as unchanged. Two solids that
  touch stay two solids.
- **Shell on a compound of several solids fails.** Shell on the one solid, taken
  out with `partition`, works. That is the reason for `withinOwningSolids`.
- `fuse`, `cut` and `intersect` report what happened to the first operand's faces
  only. Passing the tool's face hashes as well makes OCCT report the tool's faces
  too. `kernel.combine` does that, so a tool body's faces keep their names
  through a Combine. It filters out tool faces a cut discarded without reporting
  them deleted, so no name outlives its face.
- A boolean result shares every face it did not touch with its inputs. A kept
  tool beside the result would hold the same faces twice, and one hash cannot
  carry two names, so Combine with "Keep tools" runs on `kernel.duplicate` of the
  tools instead.

## Naming

New faces are ordered by their direction from a centre point before they get
tags. That centre was the bounds of the whole body; it is now the bounds of the
solids that own the new faces (`frameOf` in `rebuild/naming.ts`). Otherwise a
second body's `side-0` would depend on where the first body is, and moving one
part would rename another. For a document that is one solid the two boxes are
the same box, so every existing single-body document is named exactly as before.

## Consequences

- Features that act on "the body" act on every solid in it unless they select
  faces. Fillet, chamfer and face extrude act on what their references pick, so
  this only matters for new features, which have to decide it.
- Cut reaches every body the tool touches. Limiting a cut to chosen bodies would
  be a parameter on Extrude; it is not there yet.
- A failed feature blocks only what depends on it (see above).
- Unnamed bodies are "Body 1", "Body 2" in the order they were started, and
  renumber when an earlier body is removed. A named body keeps its name.
