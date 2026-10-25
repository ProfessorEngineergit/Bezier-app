# ADR 0005: Local-first storage and document format

- **Status:** Accepted
- **Date:** 2026-08-04

## Context

"Local-first" is the core promise: your designs live on your machine, the app works
offline, and nothing is uploaded unless you ask for it. This is the concrete
difference from cloud CAD, where documents live on a vendor's server and the viewport
may be a video stream from a hosted engine.

Promises like this are only credible if the architecture makes the opposite hard.

## Decision

### Storage: OPFS primary, IndexedDB for metadata, real files for import/export

Origin Private File System (OPFS) for document data. It is a real filesystem
in the browser, with synchronous access handles available inside workers, good
performance on large binary blobs, and no user-facing permission prompt. Documents
are stored as discrete files rather than smeared across object stores.

IndexedDB for the document index and app state, the "recent documents" list,
thumbnails, preferences, window layout. Small structured records that we want to
query, which is what IndexedDB is actually good at.

When OPFS is exposed but fails to open (observed in WebKit's restricted browser
profile), the browser uses a separate IndexedDB project store instead of losing
edits on reload. Its journal is stored as append-only segments and its snapshots
are replaced in one transaction. The app identifies the fallback because documents
in OPFS are not automatically migrated into the separate store. A browser test
forces this failure and verifies that a modeled project survives reload.

The File System Access API for explicit user-initiated open/save to real files
on disk, where supported. This is what makes a document feel like a *file* the user
owns rather than something trapped in a browser profile. On desktop builds this is
the native filesystem (see [ADR 0006](0006-desktop-packaging.md)); on browsers
lacking the API, fall back to download/upload.

### Document format: a zip container of JSON + binary parts

A `.tess` document is a zip archive:

```
document.json        the feature graph — the source of truth
sketches/*.json      sketch geometry and constraints
meta.json            name, units, created/modified, schema version
thumbnail.png        for the document browser
cache/tessellation   optional, disposable render cache
```

**`document.json` is the whole model.** Every solid is reproducible by replaying
the feature graph through the kernel. We do not store B-Rep geometry as the
source of truth.

Rationale:

- **It is small.** A complex enclosure is kilobytes of history versus megabytes of
  B-Rep.
- **It is diffable.** JSON in a zip means `git` is usable, and a human can read a
  document to understand what went wrong.
- **It survives kernel upgrades.** A stored B-Rep from OCCT 8.0 is a liability when
  OCCT 8.2 ships; a feature graph just replays.
- **It is honest about what a parametric model is.** The history *is* the document.

The cost is real and accepted: opening a document means rebuilding it, so open
time scales with model complexity rather than being a file read. Mitigated by the
disposable tessellation cache, and, if it ever becomes a real problem, by
optionally storing a BREP snapshot alongside the graph as an accelerator, never as
the source of truth.

### Schema versioning from day one

`meta.json` carries a schema version, and there is a migration path before there is
anything to migrate. Retrofitting versioning onto a format users already have
documents in is miserable; adding it now is nearly free.

### Autosave and crash safety

Autosave to OPFS on a debounce. Write to a temp file and rename, so a crash mid-write
cannot corrupt the document. Undo/redo history is in memory; the file on disk is
always a consistent committed state.

## What this explicitly rules out

- **No account required.** The app opens and works. No sign-in wall.
- **No telemetry by default.** If we ever add it, it is opt-in, documented, and
  off in the desktop build.
- **No implicit upload.** Nothing leaves the machine without an explicit user
  action. Any future sync is an opt-in feature, never the storage layer.

If a future feature requires a server, it is an *addition*, not the foundation.
The app must remain fully functional with the network switched off, and that is a
CI-testable property, not just an intention.

## Interop formats

| Format | Direction | Notes |
| --- | --- | --- |
| **STEP** | in / out | The professional interchange format. Non-negotiable, an enclosure that cannot round-trip as STEP is a toy. |
| **STL** | out | 3D printing. The wedge. |
| **3MF** | out | Better than STL (units, colours, metadata); the modern printing format. Post-M0. |
| **glTF** | out | Web/visualisation sharing. `occt-wasm` supports it. |
| **BREP** | in / out | OCCT-native; debugging and issue reports. |
| **IGES** | — | Excluded from the `occt-wasm` build. Not planned. |

## Consequences

### Positive

- The local-first claim is architecturally true, not marketing.
- Small, diffable, version-controllable documents.
- Kernel upgrades do not invalidate saved work.
- Works offline by construction.

### Negative / accepted

- Open time is rebuild time. Watch it; cache tessellation.
- OPFS is browser-profile-scoped, clearing site data deletes documents. The
  export-to-real-file path is therefore not optional, and the UI must make it easy
  and obvious. This is the single biggest user-trust risk in the storage design.
- Safari's OPFS and File System Access support has historically lagged. Test on
  Safari early and often, not at the end.

## Open questions

- Do we ship a "backup all documents" one-click export? Probably yes, early, it is
  cheap insurance against the site-data-clearing failure mode.
- Units: store canonically in millimetres and present per user preference. Needs an
  explicit decision before the first sketch is saved.
- Do we need a lock or coordination mechanism for the same document open in two
  tabs? OPFS access handles are exclusive; decide the UX for the second tab.
