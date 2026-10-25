# Features and channels

What Bezier does, which release channel each part is in, and what is being worked on. Written
2026-10-21 from the code (`apps/studio/src/channel-features.ts`, `packages/core/src/features/`) and
[`platforms.md`](platforms.md). A feature here means one that is in the app and has been used; where
something was built but not tried on every system, the table says so.

## The three channels

| Channel | What it is | Who it is for |
| --- | --- | --- |
| **Stable** | What has been on the beta and held up. The default, and what the downloads are | Everyone |
| **Beta** | The beta repository's `main`: every change has passed `pnpm check` and the browser tests, and the maintainer has used it | People who want changes early and will report what breaks |
| **Alpha** | Parts that reach beyond the machine (other people's servers, one you run) or that have not been used outside the lab | People who want to try what is not finished |

A part moves from alpha to beta to stable by changing its `gate` in `channel-features.ts` and in the
places that check the channel. Today **everything below is in all three channels, except the five
parts listed under Alpha only.**

## In every channel

**Modelling.** A history of steps where an earlier step can be changed and the later ones follow: sketch,
extrude, face extrude, revolve (also with a rise per turn), loft, sweep, wrap onto a round face, fillet,
chamfer, shell, hole, delete face, move a face or an edge, change a cylinder's radius, mirror, pattern,
move, rotate, scale, align, joint, copy, combine, split, remove body. A fillet keeps the edge it was
given when something before it changes ([how](../packages/core/README.md)).

**Sketches.** Drawing, dimensions and constraints, solved by planegcs. Sketches can stand on any flat
surface of a body.

**Files.** In: STEP (also loose surfaces, and the names the file gives its parts), IGES, STL, OBJ, DXF,
SVG, reference pictures and meshes. Out: STEP, STL, 3MF, PDF, DXF, SVG, bill of materials (CSV).

**Drawings.** Projected views, sections, dimensions, title block, sheets.

**Visualize.** Physically based materials, studio lighting, turntable, capture; a face can have a colour of
its own.

**Simulation.** Static stress on a body: supports, loads, a stress or displacement picture.

**Learn.** Lessons you follow, record and edit.

**The wiki.** The app's own documentation, in the app, searchable with ⌘K.

**Projects.** Local only: no account, nothing uploaded. Folders, search, the last projects left are kept
ready, a crash loses at most the step being made.

**Desktop apps.** macOS, Windows, Linux. Unsigned for now.

**Report a problem.** From any screen, with a picture to draw on, what the app logged and details of the
machine (never about the user), and an offer to send it after a crash.

## Alpha only

| Part | What it is |
| --- | --- |
| Community | Lessons, plugins and the leaderboard of a community store, with one switch |
| Plugins | Code other people wrote, run in a sandbox beside your model |
| Writing in the wiki | Write and change articles, every version kept, in a store you choose |
| Collaboration | Share projects and work on one model together, live, end-to-end encrypted |
| Your own servers | Run the sync server or a community store yourself and point Bezier at it |

## Being worked on (not done)

| What | State |
| --- | --- |
| Moving a small part in a project with a very large one | Takes about 1.5 s in the Voron project, because the whole display is rebuilt. Needs the display updated for the moved body only |
| Memory on small machines | Importing the Voron assembly peaks near 8 GB in the page |
| Windows | Built and started in CI, importing and the rest not yet used by hand |
| Signing and updates | Builds are unsigned and there is no updater |
| First start film and introduction | The film is made; showing it on the first start is being built, and Nib (the guide) moves from the start page into the introduction |
| A new Items panel | History, as direct modellers have it, with a place of its own at the right or the bottom. The old list of steps is hidden and is only used by the browser tests |
| Reference (non-driving) dimensions and more constraint kinds | Open in `packages/solver` |
| Benchmarks against other modellers | Import, export, move, reopen are measured on one Mac; the rest and weaker hardware are still to do |
