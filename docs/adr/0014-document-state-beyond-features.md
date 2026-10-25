# ADR 0014: What a document holds besides its features, and how it stays fast

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

Several things users expect from a CAD tool are not features in the history:
named numbers the history is written in terms of, a scanned mesh to model
against, bodies filed in folders, and an Undo that still works after the
project was closed. Each needed a place in the document or beside it, and each
had to keep the rules of ADR 0005 and ADR 0009: the document is the history,
edits are journal operations, a saved file replays exactly, and a file written
before the change still opens unchanged.

Measuring the budgets (`docs/performance.md`) also turned up a cache key that
grew exponentially with the history.

## Decision

### Variables and expressions

`DocumentMeta.variables` holds named expressions; `FeatureRecord.expressions`
holds, per numeric parameter, an expression that replaces the stored number
(`expressions.ts`). The rebuild evaluates them before validating a feature's
parameters (`rebuild/evaluate-params.ts`), so features never see an
expression and the cache keys on the evaluated value: changing a variable
rebuilds exactly the features that use it. Base units are millimetres and
degrees; trigonometry takes and gives degrees. A failing expression marks only
its feature broken, with the expression and the reason in the message. Two
journal operations, `setVariable` and `setExpression`, carry every change, so
both undo and replay.

Rejected: expressions stored inside `params` as strings. That would have made
every parameter kind a union of number and text, pushed evaluation into every
feature, and changed the saved shape of every existing document.

### Reference meshes are drawn, not built

An imported STL or OBJ is stored as a triangle soup in a `reference-mesh`
feature and drawn by the renderer, see-through and never picked. The solid
passes through unchanged. OCCT's STL reader turns a mesh into one face per
triangle and failed outright on curved meshes (occt-wasm 3.8.3, tried
2026-09-27), and a scan's hundred thousand faces would each need a name.

### Body folders

`DocumentMeta.bodyFolders` maps body key to folder name, changed by
`setBodyFolder`. Isolating a body is not state of its own: it is one grouped
edit of `setBodyVisible` operations.

### Saved views (added 2026-10-19)

`meta.savedViews` lists camera views the user saved by name (position, target, whether parallel,
zoom), in the order saved; absent when there are none. One operation, `setSavedView`, saves under a
name (replacing a view of that name in place) or removes with `view: null`. It undoes, diffs and
travels in the project file like the other document state. Added for audit F-034; a file without
the field reads as it always did.

### Undo survives a reopen

The undo and redo steps are written beside the document (`history.json`,
`session-history.ts`) after every edit, with a fingerprint of the document they
belong to. On opening they are taken back only when the fingerprint matches.
The journal alone cannot give Undo back: it mixes edits with their reversals
and does not record which operations were one gesture.

### Split faces keep one name, in a fixed order

When an operation splits a named face, every piece keeps the name (the text
format of references is a compatibility promise and does not change). The
pieces are put in a fixed order, largest area first, then by position, so the
name answers with the same piece on every rebuild instead of whichever the
kernel's hash order put first, and an edge named by that face is looked for on
every piece. Before, such an edge came back dangling.

### Cache keys chain through a fingerprint

Each feature's key used to embed the previous key via `JSON.stringify`,
re-escaped at every step, so keys grew exponentially and a history of a few
dozen features overflowed the string limit. Keys now chain through a 128-bit
fingerprint (`rebuild/cache.ts`). A collision would hand a feature another's
geometry, which is why it is 128 bits and not 32.

## Consequences

- Every new field is optional and absent when empty, so documents saved before
  this read and save exactly as they did (`project-file.ts` validates each).
- The rebuild has one more step before validation; it costs nothing for a
  feature without expressions.
- A reference mesh cannot be cut or joined. Turning one into a solid would
  need a mesh-to-solid path in the kernel that works on curved meshes.
- `history.json` is a convenience, not durability: losing it costs Undo after a
  reopen and never a byte of the document.
