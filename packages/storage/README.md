# @bezier/storage

Where "never loses state" stops being a design claim and becomes bytes on disk.

[ADR 0009](../../docs/adr/0009-durability.md) argues that one structure, an
append-only log of operations, gives crash safety, the fastest write path, undo,
and a replayable bug report simultaneously. `@bezier/core` implements the log.
This package is what actually persists it.

At a glance

| | |
| --- | --- |
| **Layer** | The journal on disk: atomic writes, snapshots, recovery, the project list |
| **Depends on** | `@bezier/core` |
| **Used by** | `apps/studio` |
| **Backends** | `OpfsBackend`, `IndexedDbBackend` (used where there is no OPFS, as on the Linux app), `MemoryBackend` (tests) |
| **Tests** | 3 files, 569 lines |
| **Read first** | `src/store.ts`, `src/journal-file.ts`, `src/backend.ts` |
| **Explained in** | [How it works: what is written to disk](../../docs/how-it-works/04-storage.md) |


## The write path

Every edit follows the same three steps, in this order:

1. **Append** the operation to the journal, atomically
2. **Fsync-equivalent**, the write is durable before anything else happens
3. **Apply** it to the in-memory document

Step 1 happening before step 3 is the whole point. If the process dies between
them, replay reconstructs the exact state. Data loss is bounded by **one
operation**, not by an autosave interval.

## Redundancy

| Copy | Survives |
| --- | --- |
| Current snapshot | normal load |
| Journal since the snapshot | a crash after the last snapshot |
| Previous snapshots (rotating, the last 3) | a corrupt or bad current snapshot |
| A file the user exports (STEP, STL ...) | clearing site data |

Not built, though an earlier version of this page listed it: a mirror of every write in a
second backend. OPFS (or IndexedDB where there is none) is the one store, so a bug in it is
not covered by a second copy. The design argument for a mirror stands; the code does not
have one yet.

## Backends

Storage sits behind an interface so the same logic serves every platform:

| Backend | Where |
| --- | --- |
| `MemoryBackend` | tests, and the last resort when nothing else opens (the app then says projects will not be saved) |
| `OpfsBackend` | the browser, and the macOS and Windows apps |
| `IndexedDbBackend` | where there is no OPFS, **as in the Linux app's web view**, or where it would not open |

A native-file backend (documents as real files on the desktop, [ADR 0006](../../docs/adr/0006-desktop-packaging.md))
is not written yet: the desktop apps use the same web storage inside their web view.

This is why the interface exists from day one rather than being retrofitted: on
desktop, documents become real files and the biggest trust problem in the web
build, that clearing site data deletes your work, disappears.

## Corruption degrades, never fails

A journal damaged at entry 400 loads 399 entries of work plus an explanation.
Refusing to open the document would be the worst possible response.
