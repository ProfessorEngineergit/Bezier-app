# Performance

The budgets, why they are these numbers, and how to measure them.

Design reasoning lives in [ADR 0007](adr/0007-performance-architecture.md). This
file is the operational half: what the numbers are, and what to do when one is
missed. The latest measurements, with their method, their raw files and what was
not measured, are in [`benchmarks.md`](benchmarks.md) (2026-10-02); the table below is the
2026-09-27 run, of the same order (a hand measurement on a working laptop does not repeat to the millisecond).

---

## The budgets

| # | Path | Budget | Status (measured 2026-09-27) |
| --- | --- | --- | --- |
| A | Camera orbit / pan / zoom | **8 ms** frame | ✅ CPU p95 0.8 ms Chromium, 2 ms WebKit, at 204 800 triangles |
| B | Hover → highlight visible | **8 ms** | ✅ pick p95 ≤ 0.1 ms at 204 800 triangles |
| C | Sketch drag: one constraint solve | **16 ms** | not measurable until the constraint solver is in; the stand-in solves nothing |
| D | Parameter change → new geometry | **100 ms** | ✅ 22 features p99 63.9 ms cold; ⚠️ 42 features 174 ms cold, 82 features 569 ms cold; an edit to the last of 40 is 31 ms |
| E | Cold load → interactive shell | **1 s** | ✅ p50 190 ms Chromium, 171 ms WebKit (production build, localhost) |
| E2 | Kernel ready | **3 s** | ✅ 68 ms under Node; first geometry in the browser, kernel load included, p50 238 ms Chromium, 270 ms WebKit (localhost, so no download time) |

How each was measured, 2026-09-27, Apple Silicon Mac: A and B with
`pnpm bench:frames` against the dev server; D and the Node kernel figure with
`pnpm bench`; E and E2 with `node scripts/load-budget.mjs` against
`pnpm --filter @bezier/studio preview`, five fresh browser contexts each.
E2 over a real network adds the download of the 4.7 MB (brotli) kernel, which
localhost does not show.

A bug the benchmark found on the way. `pnpm bench` stopped with
`RangeError: Invalid string length` in `rebuild()`. Each feature's cache key
embedded the previous key via `JSON.stringify`, re-escaping it at every step,
so keys grew exponentially and a history of a few dozen features overflowed
the string limit, in the app as much as in the benchmark. Keys now chain
through a fixed 128-bit fingerprint (`fingerprint` in `rebuild/cache.ts`,
tested in `fingerprint.test.ts`); the numbers above are after the fix.

Measured with `pnpm bench` on an Apple Silicon Mac under Node. Browser numbers
will differ, network fetch for the `.wasm`, a different JIT, and are not yet
measured. Say "measured under Node" until they are.

### A correction

An earlier version of this file reported flat per-feature cost, 1.8 ms cached
edits, and a 50× cache speedup. Those numbers were wrong. The benchmark
corpus gave every pocket the same four point ids, so the solver placed them all
at the same coordinates and only the depth varied, after the first cut, the rest
removed almost nothing. The corpus was measuring a rebuild that did no work.

Corrected below. The corpus now lays pockets out in a grid so every cut meets
fresh material, and the guard against repeating the mistake is written at the top
of `bench/src/corpus.ts`.

### What the numbers actually say

Cost per feature grows. 1.12 / 1.97 / 2.80 / 4.35 / 7.56 ms at 4 / 12 / 22 /
42 / 82 features. Total cost is super-linear, not linear: 82 features take
620 ms, not the 87 ms the broken corpus suggested.

This is not a surprise once stated. Each boolean intersects against a body that
has accumulated every previous cut, so the tenth pocket is more expensive than
the first, the headroom spike measured exactly that (3.89 ms for the first cut,
5.88 ms for the eighth). Sequential booleans on a growing body cannot be linear.

| History | Cold | Edit last | Edit first | Speedup |
| --- | --- | --- | --- | --- |
| 10 | 60.7 | 10.3 | 60.6 | 5.9× |
| 20 | 182.2 | 17.8 | 180.0 | 10.2× |
| 40 | 620.0 | 33.7 | 619.8 | 18.4× |

The cache is still worth a great deal, 18× at forty features, but a cached edit
is not flat either. Editing the last feature still means cutting into a body
that carries every earlier pocket.

Two budgets are now missed, and they are stated rather than quietly dropped:

- A 42-feature cold rebuild is 185 ms against a 100 ms budget.
- An 82-feature rebuild is 620 ms.

### Where the cost actually is, and what was ours

Split by phase in [`tools/spikes/rebuild-scaling.ts`](../tools/spikes/rebuild-scaling.ts):

| | |
| --- | --- |
| A single cut, on an 11-face body | 5.76 ms |
| The same cut, on a 211-face body | 27.25 ms |

Most of the growth is OCCT's, and it is inherent: each boolean intersects
against a body carrying every previous cut. Our own bookkeeping held a steady
13–19% share, so it was not the driver.

It was still worth attacking, because it turned out to be almost entirely one
thing. Measured across a 106-face body:

| Query | Cost |
| --- | --- |
| `getSurfaceArea`, per face | 1.45 ms |
| `getSurfaceCenterOfMass`, per face | 1.56 ms |
| `hashCode`, per face | 0.018 ms |
| `surfaceType`, per face | 0.124 ms |
| `queryBatch`, the "batched" call | **10.2 ms**, worse than either |

Area and centroid were 94% of describing a face, and the naming layer needs
them only for the faces it is about to *name*, a handful per feature, not all
206. Splitting `describeFaces` from `measureFaces`, and taking the body's
reference point from a bounding box instead of averaging every centroid:

**`describeFaces` 1.69 ms → 0.12 ms, and a rebuild of 82 features 726 ms → 620 ms.**

Tessellation is 0.95 ms and edge extraction 0.05 ms. What remains is booleans,
and the lever there is doing fewer of them.

Status is measured, not aspirational. Nothing is marked green until a benchmark
exists and passes. An unmeasured budget is a wish.

## Why these numbers

8 ms, not 16. A 120 Hz display has an 8.3 ms frame. Targeting 60 fps on
hardware that can do 120 gives away half the smoothness the user paid for, and
ProMotion Macs are the machines this audience uses.

16 ms for a solve because it happens once per frame during a drag, not once
per pointer event. Coalescing to one solve per frame is part of the design.

100 ms for a rebuild because that is roughly where a direct-manipulation
action stops feeling like a consequence of what you did and starts feeling like a
request you submitted. Beyond it, the UI must show that work is happening.

1 s to interactive because the shell must not wait on 4.7 MB of WebAssembly.
Browsing documents and reading the feature tree work before the kernel exists.

## Batching versus the cache

Measured in [`tools/spikes/batching-vs-cache.ts`](../tools/spikes/batching-vs-cache.ts), on
twelve pockets:

| Path | Sequential + cache | Batched (`cutAll`) |
| --- | --- | --- |
| Cold build | 88.9 ms | **18.4 ms** |
| Edit the last feature | **11.3 ms** | 18.0 ms |
| Edit the first feature | 86.7 ms | **18.0 ms** |

Batching is flat; caching is spiky. A batched call costs the same whichever
feature changed, because it never depended on per-feature intermediates. The cache
is excellent when the edit is late in the history and no help at all when it is
early.

Batching wins two of the three paths, and loses the third by 1.5×. An earlier
version of this section concluded the opposite, it compared only the cold build
against editing the *last* feature and never measured editing an early one, which
is the case where caching has nothing to offer.

So the blocker is not performance. A batched call returns one `EvolutionData`
for the whole batch, and the naming layer needs per-feature attribution. Getting
it back means deciding which tool produced each new face.

There is an exact way to do that, and a fuzzy one:

- **Exact:** a face generated by cutting with tool *T* lies on *T*'s boundary, so
  a point-containment test against each tool answers it outright, as long as the
  tools are disjoint, which bounding boxes settle cheaply. Overlapping tools are
  ambiguous, and there the batch should fall back to sequential.
- **Fuzzy:** matching by geometric signature. This is precisely what
  [ADR 0001](adr/0001-geometry-kernel.md) warns against putting in the path of the
  naming layer, and it should not be used here.

Disjoint tools are the common case in enclosure work, bosses, vents and ports do
not overlap, so the exact route covers most of the win.

### The design that works

`cutAll` turned out to be unusable: it returns a shape and no history at all.
Reconstructing `modified` and `unchanged` ourselves would put geometric matching
directly in the path that carries *existing* user selections, which is far worse
than using it to name new faces.

The way around it, measured in [`tools/spikes/fused-tool.ts`](../tools/spikes/fused-tool.ts):
**fuse the tools into one solid, then do a single `cutWithHistory`.**

| | |
| --- | --- |
| Twelve sequential cuts, with history | 89.3 ms |
| `fuseAll(tools)` then one `cutWithHistory` | **36.3 ms, 2.5×** |
| `modified` reported by OCCT | ✅ complete |
| Result faces attributable to exactly one tool | **61 of 66** |
| Ambiguous | **0** |
| Belonging to no tool | 5, correctly, the untouched box faces |

So existing names carry forward through the ordinary OCCT path, and only the
*new* faces need attribution, by exact point containment against each tool, not
by signature. A face contained by more than one tool means the tools overlap;
that is detected rather than guessed at, and such a batch falls back to
sequential cuts.

Not yet integrated. It touches `rebuild()` and the naming layer, which is the
product, so it needs its own tests for disjoint *and* overlapping tools before it
goes anywhere near the pipeline.

## The Parasolid question

The stated goal is to be faster than the commercial modellers at equal functionality. Many of
them run Parasolid, natively. We run OCCT, through WebAssembly. It is worth being
precise about what that means rather than discovering it later.

### Where we lose, and cannot win

**Per-operation, Parasolid is faster than OCCT, and WebAssembly costs more on
top.**

- A published forum comparison has OCCT at 1,766 ms against Parasolid at 94 ms for
  one boolean, roughly 19×. It is a single old data point on 2005-era
  hardware and should not be treated as a general ratio, but the direction is
  consistent, and OCCT's own community
  ([forum](https://dev.opencascade.org/content/how-increase-boolean-operation-performance))
  acknowledges being slower than Parasolid on booleans.
- WebAssembly adds 45–55% on average, peaking at 2.08–2.5×, versus native
  ([Jangda et al., USENIX ATC '19](https://www.usenix.org/conference/atc19/presentation/jangda)).

Compounded, a single boolean may cost us somewhere between 2× and 20× what it
costs them. No amount of engineering effort on our side closes that, because
it is forty years of Siemens kernel optimisation plus a runtime tax. Planning to
win that race is planning to lose.

### Where we win, and already do

By doing less work, not by working faster.

A direct modeller recomputes from the model as it stands. Ours is parametric with a content-addressed cache,
so a parameter change replays only what depends on it. Our measured edit costs
1.8 ms regardless of history length. Even at a hypothetical 0.2 ms per
Parasolid boolean, replaying forty features costs 8 ms, more than our 1.8 ms,
while being four times better at the thing we are worse at.

That is the whole strategy, and it is the only one available:

| Lever | Status |
| --- | --- |
| **Do fewer operations**, incremental rebuild | ✅ 50× measured |
| **Never block the UI**, kernel in a worker | next |
| **Start instantly**, 4.7 MB vs a ~500 MB install | ✅ 80 ms kernel load |
| **Reuse tessellation** across rebuilds | not started |
| Parallel booleans, OCCT supports it, we do not use it | not started |
| A SIMD `.wasm` build | not started |

The last three are real, untapped, and entirely within our control. They should be
measured before anyone considers touching the kernel itself.

### How much of the gap is actually closable

More in [`kernel.md`](kernel.md). The headline: **OCCT's own documentation says 89% of a boolean's time is the
intersection phase**, and every unexposed tuning option targets exactly that.

Our measured 3–4× from batching is the same fact seen from the other side, one
intersection phase for N tools instead of N phases.

| Lever | Expected | Confidence |
| --- | --- | --- |
| Batch consecutive booleans (`cutAll`) | **3–4×** | measured |
| `SetUseOBB`, tighter bounding volumes | 1.1–1.4× | plausible, unmeasured |
| SIMD build | 1.1–1.3× | typical for float-heavy code |
| `SetRunParallel` + threads | 2–3× on multi-tool ops | plausible |

They overlap rather than multiply. A defensible ceiling is **5–10× on
multi-feature rebuilds**, an 87 ms cold rebuild becoming roughly 10–20 ms.

Per single boolean we stay perhaps 5–10× behind Parasolid, and that does not
close. What closes is the gap users experience, because nobody waits on one
boolean; they wait on a rebuild.

**Note what this does *not* improve:** the 1.8 ms cached edit is already dominated
by the cache, not the kernel. Kernel work buys faster document opening and faster
edits early in a long history. It does not make the common case faster.

### What we do not do

Fork OCCT. It is roughly 1.5 million lines of C++. Forking means maintaining a
C++ fork and a WASM toolchain forever, and it would consume the project without
closing the gap. If OCCT's boolean performance ever becomes the actual bottleneck
- and the numbers above say the cache matters far more, the cheaper answers are
upstreaming a patch, or a faster path for the specific operation that hurts.

## Payload budget

| Asset | Size | Note |
| --- | --- | --- |
| OCCT `.wasm` | **4.7 MB** brotli (21 MB raw) | measured; lazy, cached, never inlined |
| planegcs `.wasm` | **496 KB** | measured; loaded with the sketcher |
| App shell JS | **≤ 300 KB** brotli | budget; currently **62 KB gzip**, with zero OCCT code |
| Kernel worker chunk | — | 41 KB, loaded off the main thread |

The shell figure is only true because the in-process kernel is not re-exported
from `@bezier/kernel`'s index, a static re-export pulled 74 KB of OCCT wrapper
into the main bundle. Verified by inspecting the built output; see
`packages/kernel/README.md`.

The two `.wasm` files also ship as separate runtime-loaded artifacts for licence
reasons ([ADR 0003](adr/0003-license-model.md)), the performance argument and the
legal argument happen to want the same thing.

## Rules that follow

Summarised from ADR 0007. Full reasoning there.

1. **React never re-renders on camera movement or hover.** The viewport owns its
   own rAF loop; camera and highlight are pushed imperatively.
2. **Picking is a CPU BVH raycast, not GPU readback.** `readPixels` is a
   synchronous pipeline stall and blows the 8 ms budget on some drivers.
3. **The solver runs on the main thread and warm-starts** from the previous
   solution. Warm-starting is a correctness property, not just a speed one, a
   cold numeric solve can land on a different valid answer and make a dragged
   sketch jump.
4. **Rebuild is incremental**, cached per feature under a content hash of its
   parameters plus its input hash.
5. **Geometry crosses the worker boundary as Transferables.**
6. **No allocation per frame** in paths A, B, C. Elsewhere, write normal code.

## Measuring

> Not yet implemented. This section is the contract for the benchmark harness,
> written before the harness so the harness gets built to fit it.

```bash
pnpm bench          # paths B, C, D against a fixed corpus
pnpm bench:load     # path E against the production build
pnpm size           # payload budgets
```

A fixed corpus. Benchmarks run against committed documents of known
complexity, a simple bracket, a realistic enclosure, a deliberately nasty part -
so numbers are comparable across machines and across months.

Report distributions, not means. p50 tells you how it usually feels; p99 tells
you why it feels bad. A path with a good mean and a terrible p99 is a path that
janks, and janking is what users actually notice.

CI fails on regression, not on absolute value. Runner hardware is too noisy
for absolute thresholds. Compare against the base branch and fail on a
statistically meaningful slowdown.

## When a budget is missed

In order. Do not skip to 4.

1. **Measure before you touch anything.** Profile the real path. The bottleneck is
   almost never where it feels like it is.
2. **Check for accidental work**, a re-render that should not happen, a rebuild
   that should have been a cache hit, an allocation in a loop. Most misses are
   this, and the fix costs nothing.
3. **Do less.** Coarser tessellation, fewer solves, a smaller BVH. Reducing work
   beats speeding it up.
4. **Only then optimise the code.** And write down why, in a comment, next to the
   ugly part, an unexplained optimisation gets "cleaned up" later and the
   regression comes back.

## Known unknowns

What has not been measured. Each is a real risk to the numbers
above:

- **Sketch size where a main-thread solve misses 16 ms.** Unknown. Bounds how
  large a sketch can get before dragging degrades.
- **BVH raycast on a 500k-triangle model.** Unknown whether it holds 8 ms, or
  whether hover needs a screen-space acceleration structure of its own.
- **WebKitGTK** on Linux desktop ([ADR 0006](adr/0006-desktop-packaging.md)).
  Historically the weakest WebGL and WASM implementation of the three targets, and
  it is one of our shipping platforms.
- **Rebuild cost on a realistic enclosure**, twenty features, shells, holes.
  The 100 ms budget is an assertion, not an observation.
- **Memory ceiling.** OCCT allocates outside the JS heap and the GC cannot help.
  Where does a large model actually break?

## The frame budget, measured (2026-08-06)

Paths A and B from [ADR 0007](adr/0007-performance-architecture.md), camera and
hover, now have numbers instead of intentions.

```bash
pnpm --filter @bezier/studio dev   # one terminal
pnpm bench:frames                  # another
```

`scripts/frame-budget.mjs` drives `apps/studio/bench.html`: a bare page with a
synthetic displaced surface and no application around it, swept across four
loads, in Chromium and WebKit.

The orbit is turned through `viewport.orbit`, the view cube's path. It was once
driven with synthetic pointer presses, which stopped turning the camera when
navigation was routed per button: nothing was drawn, the frame cost read NaN,
and the page still printed a verdict. A run now counts only when the camera
turned and a frame was drawn on at least 90 % of its 120 steps; otherwise the
row says why and the verdict is `INVALID` (`bench-validity.ts`), and
`pnpm bench:frames` exits non-zero.

| Triangles | cpu p95 (Chromium) | gap p95 (Chromium) | cpu p95 (WebKit) | gap p95 (WebKit) | pick p95 |
| --- | --- | --- | --- | --- | --- |
| 1,152 | 0.20 ms | 9.20 ms | 1.00 ms | 34.00 ms | ≤ 0.10 ms |
| 12,800 | 0.20 ms | 9.30 ms | 1.00 ms | 34.00 ms | ≤ 0.10 ms |
| 51,200 | 0.20 ms | 9.20 ms | 1.00 ms | 34.00 ms | ≤ 0.10 ms |
| 204,800 | 0.20 ms | 9.30 ms | 1.00 ms | 34.00 ms | ≤ 0.10 ms |

Both hot paths are inside budget with room to spare. Picking a face out of
204,800 triangles costs a tenth of a millisecond against a budget of eight; the
BVH from ADR 0007 is doing its job. Roughly a third of the sampled rays hit
geometry, so that figure is over real work rather than over misses, which is
checked and reported, because a fast average over nothing looks identical to a
fast average over something.

The frame gap does not move with load, and that is the whole finding. It is a
presentation cap, not a rendering limit: WebKit sits at 30 fps and Chromium at
120 fps whatever they are handed. Recorded in
[ADR 0006](adr/0006-desktop-packaging.md), where it decides nothing about
packaging and everything about what has to be fixed before the desktop build is
shown to anyone.

### Two ways this benchmark lied before it told the truth

Both worth keeping, because both are easy to repeat.

Headless meant no GPU. The first run reported 86 ms frames. That was software
rasterisation, a confident measurement of a machine without a graphics card. The
runner launches headed now, and says why.

CPU time alone said everything was perfect. `render()` queues commands and
returns; measuring around it reported 0.1 ms while frames were being missed
entirely. The gap between frames is reported alongside it for that reason.

## A large real assembly, measured (2026-09-28)

The Voron 2.4r2 printer: 241 MB of STEP, 1715 solids, 107,855 faces, about
4 million triangles on screen. GPL-3.0, from github.com/VoronDesign/Voron-2.

```bash
pnpm --filter @bezier/bench large-import /path/to/Voron_2.4r2_Assembly.step [store-dir]
```

Node on an Apple Silicon Mac, the real `rebuild()` against the real kernel:

| | Before | After |
| --- | --- | --- |
| Import | failed (engine corrupted, then timed out) | 89 s |
| Open again (shape kept as BREP) | same as import | 34 s |
| Draw a small part beside it | 10.5 s | 2.6 s, 1.9 s after reopening |
| Picking tree over 4 M triangles | 1.5 s on the main thread | 0.69 s |

Where the import time goes now: `importStep` 56 s (OCCT's STEP reader; 1.8 s
when the shape comes back from the store), first meshing 32 s. What removed the
rest: occt-wasm 5.3.5 (3.8.3 corrupted its heap on this file), meshing,
outlining and bounding solid by solid, reusing the meshes of unchanged solids,
naming a new import's faces in file order instead of measuring all of them
(`faceOrder: 'file'`), and a watchdog that measures silence instead of
duration, so a 30-second mesh is not taken for a hang.

### In the browser, on the GPU (2026-09-28)

Headless Chromium draws WebGL in software unless told otherwise; with
`--use-angle=metal --enable-gpu --ignore-gpu-blocklist` it reports the real
GPU (here an Apple M1 Max) and frame times mean something. Production build,
device pixel ratio 2, the Voron assembly on screen:

| | Before | After |
| --- | --- | --- |
| Orbiting, frame gap p50 / p95 | not measurable (tab crashed or froze) | 8.3 / 8.7 ms (120 Hz) |
| Extrude a part beside it, click to settled | 8.2 s, 7 main-thread stalls up to 0.9 s | 4.6 s, one stall of 0.3 s |
| Same edit, kernel side (Node) | 1.37 s | 0.63 s |

What it took:

- **While the camera moves, a heavy model (over a million triangles) is drawn
  at one pixel per point and without its outlines** (`interaction-quality.ts`),
  full quality 180 ms after it stops.
- **The picking tree and the seams are built on a worker** above 300,000
  triangles (`geometry-worker.ts`): 0.95 s and 1.6 s of the main thread per
  rebuild before.
- **Nothing hashes the imported file on an edit any more.** The document holds
  the 241 MB of STEP text, and four places ran over all of it on every edit:
  the rebuild cache key, the undo history's document fingerprint (now folded
  feature by feature, to the same value), the size of each undo step, and the
  journal, which read itself back to count its entries.
- **Face descriptions are kept per solid** in the kernel, like the meshes:
  describing all 108,000 faces again was 0.8 s of every edit and as many new
  handles.
- `listBodies` and `unchangedBody` work from face hashes instead of describing
  every face and releasing each handle with a call of its own.

A large import also streams: the parts appear on screen as they are meshed,
and the outline shown after the file is read stays until the model replaces
it.

### In the Mac app's engine, editing and reopening (2026-09-28, later)

The numbers above were Chromium. The Mac app is WebKit, and there the same
build was still far from usable: measured with Playwright's WebKit, headed,
with OPFS (a persistent profile, as the app has), the Voron assembly on screen.
Every change below is measured by `bezier:` User Timing entries the app now
records (`apps/studio/src/trace.ts`, plus `bezier:upload` in the renderer), so
the breakdown can be read from any browser's performance panel.

| | Before | After |
| --- | --- | --- |
| Add a part beside it, click to settled | 5.1 s | 1.4–2.4 s |
| Undo it | 2.5 s | 2.1 s |
| Kernel side of that edit (Node) | 1.23 s | 0.43 s |
| Open the project in a new session (Node, kernel) | 51 s | 24 s under load; meshing 47 s → 2 s |
| Idle window, CPU / GPU process | ≈ 20 % / 20 % | 0 (nothing is drawn) |
| Start page with the Voron as the last project | 12–19 s before the first tile | at once |

What it took:

- **Lightweight detail.** A body of more than 20,000 faces is drawn at a draft
  setting (0.5 mm, 0.8 rad): 1.43 M triangles instead of 4.0 M. View → Display
  Modes → *Detail while modelling* (Automatic / Full / Lightweight). Exports
  are not affected. The existing Quality setting never took effect in a
  session: OCCT keeps a face's triangulation and only meshes again for a
  *finer* one, so coarser requests got the old mesh back (6.07 M triangles at
  every setting when run finest first). A coarser setting now meshes a copy
  (`tessellation.ts`).
- **Coverage counted once per solid.** Meshing, outlining and describing a
  body solid by solid first checked that the solids cover it, by listing the
  face and edge hashes of all 1,715 solids, twice per edit, 0.6 s of 1.5.
  The count is now kept with each cached solid and taken with `subShapeCount`.
- **The journal stays small.** OPFS `createWritable({ keepExistingData })`
  copies the whole file before an append: 9 ms at 1 MB, 310 ms at 250 MB in
  WebKit, and the imported STEP text is one entry. Entries over 64 KB are now
  kept in files of their own (`packages/storage/src/journal-file.ts`); older
  journals are moved over the first time they are opened.
- **Imports keep their meshes.** After the first mesh, each solid's triangles
  and outlines are written beside the shape's BREP, faces named by position
  because hashes do not survive a session (`kept-displays.ts`,
  `mesh-store.ts`). 135 MB for the Voron at the default setting.
- **A trial builds without drawing.** `Session.tryApply` used to preview the
  whole model, triangulated, copied out of the worker, named, to learn
  whether one feature built, and then do it again for real.
- **Drawn on demand.** The render loop drew every frame whether anything had
  changed or not, including behind the start page. It now draws when the
  camera moves, when the viewport is told something, or while something
  animates (`scene.ts`).
- **Names read in place.** Listing bodies and naming faces for picking each
  copied the naming maps (108,000 entries) and parsed every name again.
- **No project opened at start.** The start page used to wait for the last
  project to load, and then rebuild it in the background, where it held the
  one geometry worker against whatever was opened next.
- **The desktop app reads files raw.** The file panel handed the page base64
  inside JSON: 321 MB of text for the Voron, decoded a character at a time.

Still open: reading the STEP file itself (about two minutes in WebKit, one in
Node), and parsing the 241 MB journal entry on the main thread when a project
opens (2.6–3.5 s, one long frame).

### Every speed, measured and compared (2026-09-28, evening)

Small-model speeds come from `node scripts/speed-suite.mjs` (production build,
OPFS, median of three); large-model ones from the Voron benchmarks. Apple
Silicon, nothing else running.

Small parts, all within target; the app's own share of a first solid is
31 ms, the rest of what the suite times is the click itself:

| | Chromium | WebKit | Target |
| --- | --- | --- | --- |
| S1 start → projects | 211 ms | 247 ms | ≤ 1 s |
| S2 new project | 89 ms | 94 ms | ≤ 300 ms |
| S6 first solid | 228 → **111 ms** | 276 → **161 ms** | ≤ 100 ms (app side 31 ms) |
| S6 duplicate a body | 28 ms | 24 ms | ≤ 100 ms |
| S8 undo / redo | 23 / 24 ms | 15 / 15 ms | ≤ 100 ms |
| S13 export STL / STEP / 3MF | 70 / 141 / 63 ms | 92 / 142 / 95 ms | ≤ 1 s |
| S3 reopen a project | 43 ms | 87 ms | ≤ 500 ms |

The first solid was slow because the geometry worker started on its first
call; it is now started, and run through one throwaway box, while the
projects are on screen (`boot.ts`, `warmUp`).

The Voron assembly in WebKit (1,715 solids, 241 MB STEP):

| | This morning | Now | Target |
| --- | --- | --- | --- |
| S5 import, total | 133–330 s | 77–87 s | ≤ 60 s |
| S5 of that, project blocked | all of it | **7.5 s** | — |
| S4 open in a new session | 55 s | **5.6 s** | ≤ 10 s |
| S7 extrude beside it | 5.1 s | 1.2 s | ≤ 500 ms |
| S8 undo that | 2.5 s | **0.3 s** | ≤ 500 ms |
| Undo right after an extrude | 183 s (!) | 0.3 s | — |
| S10 orbit, frame gap p50 | 17 ms (60 Hz cap) | 17 ms | ≤ 8.3 ms at 120 Hz |

What each took:

- **Import in a worker of its own** (`kernel/background-import.ts`). A second
  geometry worker reads the file, meshes it and leaves shape, meshes and
  outlines in the store, then shuts down; the project's worker takes it from
  the store in seconds. The project stays open for work meanwhile.
- **One digest of the imported file** (`textKey`), shared by the rebuild cache,
  the undo history and the store, and the file asked for by that key before it
  is sent to the worker at all (`importKept`). Opening ran over the 241 MB
  four times and copied it once.
- **Contacts by box first** (`nearSolids`). After every extrude the app asks
  which bodies the new one touches, and asked all 1,715, a partition and a
  distance test each, three minutes, holding the session so the next Undo
  waited as long.
- **No full-detail mesh behind the scenes.** Sketching on a face, Project, the
  contact check and exports each rebuilt the model *with* a display, at full
  detail, while the view drew it lightweight, every solid meshed twice the
  first time.
- **The drawing of a body seen a moment ago is taken again.** Undo returns the
  body the rebuild cache already had; its mesh, names, body list and picking
  tree are reused (`Session.#drawn`, `off-thread.ts`).
- **`tryApply` tries by doing.** An edit is written and built, and taken back
  if it does not build, instead of being built as a trial first.

Later the same evening, WebKit, the Voron assembly:

| | Before | After |
| --- | --- | --- |
| S4 open, longest frame on the page | 1.4–3.2 s | **0.13 s** |
| S4 open, total | 5.2–6.9 s | 5.4–7.2 s (the loading moved, it did not shrink) |
| S7 extrude beside it, app's own time (`change`) | 0.74 s | 0.64–0.69 s |
| Undo right after that extrude | 97 s | 0.28 s |

- **Documents load in a worker** (`load-document.ts`, `load-worker.ts`): read,
  parsed, replayed and the long texts digested off the page, so opening a
  large project no longer freezes it.
- **Contacts in one kernel call, capped** (`contactsNear`): the box filter
  alone was not enough with a part dropped in the middle of the printer,
  where dozens of parts are within reach, each then took a partition over
  every solid before its distance test. The candidates are measured directly
  now, and more than eight within reach is not asked about at all.
- **No coverage count.** Whether a body is made only of solids is read off
  its structure (`solidLeaves`), not counted: counting its 300,000 edges was
  0.8 s of an edit.
- **Outlines at the display's setting**, and the faces asked for once per
  drawing instead of twice.

### Dragging on a large model (2026-09-28, WebKit, the Voron)

A face pulled on the printer's top panel, dragged for 1.3 s the way a hand
drags (`drag-bench`, one pointer step every 16 ms):

| | Before | After |
| --- | --- | --- |
| Model updates during the drag | 4 (one every ~0.8 s) | **54** (5–10 ms each) |
| First update after the drag starts | 0.88 s | **0.16 s** |
| Settled after the pointer stops | 1.86 s | 0.91 s |

- **A drag rebuilds one part, not the model** (`session-part-edit.ts`). A
  face pull, round or bevel touches only the solid it is on, so that solid is
  taken out of the body once when the drag starts and edited at each step;
  the viewport draws it in place of the old one (`part-preview.ts`), whose
  triangles and edges are folded away in the buffers the GPU already has -
  a few kilobytes sent again, not the model's tens of megabytes. Every step
  was a full rebuild before: 0.4–0.5 s of rebuild, 0.09 s of body list,
  0.22 s of drawing and 0.06 s of upload.
- **Rounding and bevelling work on assemblies at all.** occt-wasm refused
  every round on a body of several parts (see kernel.md); they are applied
  to the part the edge is on. On the Voron one round is 0.4–1.0 s of rebuild
  in Node (`bench/src/large-import.ts`), where before it could not be done.
- **Colours from the file.** An imported STEP keeps the colours it was
  exported with; they are read from its text once (1.2 s parse, 0.85 s to
  match, 1709 of 1715 solids) and kept beside its shape, and a reopened
  project costs nothing more. Faces made by later edits take their part's
  colour.


### Seeing an import arrive (2026-09-28, WebKit, the Voron)

| | Before | After |
| --- | --- | --- |
| Outline on screen after choosing the file | ~75 s | **3.5 s** |
| Model drawn | ~80 s | ~80 s (OCCT reading the file) |

- **The outline is read from the file's text** (`step-outline.ts`, in a
  worker of its own beside the one OCCT reads in): every edge drawn as the
  line, arc or control polygon it is, each part placed through the assembly
  above it. 2.7 s for 242 MB in Node, 287,982 lines against OCCT's 288,859
  edges. OCCT's own outline replaces it when the file is read.
- Found by profiling the first version, which took 10.4 s: a statement a
  character at a time, a string sliced per statement and a regular expression
  per point. `indexOf` from `;` to `;`, a lookup by type and plain `Number`
  took it to 2.7 s (`tools/spikes/step-outline.ts`).

## Adaptive detail (2026-09-30)

The viewport answers to measured frame time rather than to triangle count
alone : resolution while
moving steps between 0.5 and full (`frame-budget.ts`,
`interaction-quality.ts`); each solid is culled, drawn coarse or drawn finer
from its size on screen (`solid-lod.ts`, `lod-body.ts`); the view's own
background work runs in 4 ms slices only while the camera is still and idle
frames arrive on time (`background-work.ts`).

Measured on the Voron (2.71 M triangles), WebKit, real GPU, 1440×900 at 2×,
150-step right-button orbit. "Before" is the same build with adaptation and
LOD switched off, i.e. the old fixed one pixel per point while moving. Load is
all ten cores busy plus a window saturating the GPU (it drew at 6 fps).

| | before p50 / p95 ms | before resolution | after p50 / p95 ms | after resolution |
| --- | --- | --- | --- | --- |
| far, idle machine | 17 / 28 | 1 | 17 / 26 | 1.9–2 |
| mid, idle | 17 / 37 | 1 | 17 / 43 | 1.4–2 |
| close, idle | 17 / 29 | 1 | 17 / 30 | 1.25–2 |
| far, GPU saturated | 20 / 137 | 1 | 22 / 144 | 0.5–0.6 |
| close, GPU saturated | 18 / 151 | 1 | 18 / 144 | 0.5 |

What it shows: with the machine free, the model now turns at full resolution
at the same frame times the old half resolution had. With the GPU saturated by
another program, neither version is smooth, and dropping to half a pixel per
point does not help: the long frames are waits for the other program's GPU
work, not our fill or triangles. Two measuring mistakes found on the way, both
now fixed: pressure counted only frames drawn back to back (under load input
arrives slower than frames, so it read zero), and the budget was the display's
refresh read off idle frames (which a GPU load slows too). An earlier "60 fps
orbit" in this session dragged with the left button, which selects, and
measured nothing.

### A pixel budget while moving (2026-09-30, later)

A wide Retina monitor (3440 × 1440 points at 2×) is a drawing buffer of
17–20 M pixels, twice a 4K screen. `apps/studio/src/fill-bench.ts` turns a
2 M-triangle mesh in such a window (Chromium, M1 Max, 60 Hz display) and
reads the GPU's time per frame by stalling on it:

| fixed ratio | M pixels | GPU p50 ms | GPU p95 ms |
| --- | --- | --- | --- |
| 1 | 5.0 | 5.6 | 5.9 |
| 1.25 | 7.7 | 9.1 | 21.9 |
| 1.5 | 11.1 | 8.5 | 32.7 |
| 2 | 17.4 | 9.2 | 66.8 |

The median barely moves; the slow frames grow with the pixel count, and they
are what reads as stutter. The spread between runs is large (a repeat at 2×
gave p95 14–16 ms), so the comparison that decided it was repeated three
times, with the app's own adaptation:

| while moving | width drawn | GPU p50 ms | GPU p95 ms |
| --- | --- | --- | --- |
| full resolution (before; now "Always sharp") | 6880 | 12.5–14.5 | 13.8–15.8 |
| pixel budget, default | 3440 | 6.3–6.8 | 7.5–10.7 |

So the resolution while moving is also held to a pixel count
(`interaction-quality.ts`, `movingPixels`): 6 M at the default, 4 M at the
smooth end, none at the sharp end, applied the moment the view starts to
move, not after frames have come late. A laptop window (3–5 M pixels) never
meets it and turns at full resolution. The still picture is always drawn at
full resolution.

Not yet measured: the same in the Mac app's WebKit with the Voron, and
whether unlocking WebKit's 60 fps preference for page rendering helps on a
120 Hz ProMotion screen (the orbit measured 17 ms p50 in WebKit, which is the
60 Hz cap, not the renderer).
