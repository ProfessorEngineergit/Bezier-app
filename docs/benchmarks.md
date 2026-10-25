# Benchmarks

What was measured, on what, how, and what was **not** measured. Every number here
comes from a raw file in [`bench/results/`](../bench/results), and every command is
given so that you can measure it yourself and compare. The budgets they are held
against are in [`performance.md`](performance.md).

> **Read these as orders of magnitude, not as a lab result.** The run below was done
> by hand on a working laptop, with other applications open and the power state not
> controlled. Medians of three to five runs; the individual runs are in the raw files.
> Absolute numbers belong to the machine and are compared run to run (the same
> reasoning as in [`performance.md`](performance.md)): a pass or fail gate on shared CI
> hardware would be either meaningless or flaky.

## The machine

| | |
| --- | --- |
| Date | 2026-10-02 |
| Machine | Apple M1 Max, 10 cores, 64 GB |
| System | macOS 27.0 |
| Software | Node 25.2.1, Playwright 1.62.1 (Chromium and WebKit builds it installs) |
| Build | the production build (`pnpm build`), served with `vite preview` |
| Raw data | [`bench/results/2026-10-02-apple-m1-max/`](../bench/results/2026-10-02-apple-m1-max) |

## 1. The geometry kernel

`pnpm bench`: the real OCCT kernel, compiled to WebAssembly, in Node. No mock (see
[`contributing/testing.md`](contributing/testing.md)). Raw: `kernel.txt`.

| What | p50 | p99 | Budget |
| --- | ---: | ---: | ---: |
| Cold kernel load (4.7 MB of WebAssembly) | 78 ms | | 3000 ms |
| Rebuild, 2 features | 2.0 ms | 2.3 ms | |
| Rebuild, 8 features | 15.8 ms | 22.3 ms | |
| Rebuild, **22 features** ("medium") | **64.9 ms** | **67.3 ms** | **100 ms** |
| Rebuild, 42 features | 183.8 ms | 185.6 ms | |

A single medium rebuild breaks down as 0.98 ms tessellation, 0.11 ms describing the
faces, 0.05 ms extracting edges: the cost is the kernel replaying the history, not
turning the result into something drawable.

### How the cost grows with the history

| Features | Total p50 | Per feature |
| ---: | ---: | ---: |
| 4 | 4.4 ms | 1.10 ms |
| 12 | 23.8 ms | 1.98 ms |
| 22 | 61.5 ms | 2.80 ms |
| 42 | 181.1 ms | 4.31 ms |
| 82 | 617.1 ms | 7.53 ms |

**This is not flat, and it is not hidden.** A full rebuild costs more per feature the
longer the history is (about 7x per feature from 4 to 82 features), so a very long
history is slow to open in full. The answer in the design is not to rebuild in full:

| History | Full rebuild | Edit the last feature | Edit the first | Speed-up |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 60.9 ms | 10.8 ms | 60.4 ms | 5.6x |
| 20 | 179.9 ms | 18.3 ms | 180.1 ms | 9.9x |
| 40 | 616.5 ms | 35.0 ms | 617.6 ms | 17.6x |

Changing the last feature of a warm history only rebuilds from there on (35 ms at 40
features instead of 617). Changing the **first** one costs a full rebuild, because
everything after it depends on it. That is inherent to a history, not a defect.

## 2. Starting, in a browser engine

`node scripts/load-budget.mjs`, five cold runs each (a fresh browser context, nothing
cached). Raw: `load.txt`.

| | Chromium | WebKit |
| --- | ---: | ---: |
| Start page answering (p50) | 120 ms | 182 ms |
| First geometry on screen (p50), including loading and starting the kernel | 405 ms | 282 ms |

## 3. The waits a person meets

`RUNS=3 node scripts/speed-suite.mjs`: each timed from the click to the app no longer
being busy, against the production build, with persistent storage (OPFS), as the Mac
app has it. Medians of three. Raw: `speed.txt`. The labels (S1, S2 ...) number the waits a person meets: starting the app, making a project, the first solid, undo, export and so on.

| | Chromium | WebKit |
| --- | ---: | ---: |
| S1 start to the project list | 364 ms | 325 ms |
| S2 new project | 53 ms | 79 ms |
| S6 first solid | 216 ms | 220 ms |
| S6 duplicate a body | 28 ms | 24 ms |
| S6 duplicate, the 9th body | 29 ms | 23 ms |
| S8 undo | 22 ms | 12 ms |
| S8 redo | 16 ms | 15 ms |
| S13 export STL | 67 ms | 89 ms |
| S13 export STEP | 149 ms | 129 ms |
| S13 export 3MF | 82 ms | 93 ms |
| S3 reopen a project | 48 ms | 70 ms |

The first solid, by phase (Chromium, last run): 100 ms for the change itself, of which
78 ms is the rebuild, 13 ms the write to disk, 7 ms the history, 2 ms the display.

## 4. Frames: the camera and the pointer

`node scripts/frame-budget.mjs`, the benchmark page at `/bench.html`. The budget
([ADR 0007](adr/0007-performance-architecture.md)) is 8 ms for camera movement and 8 ms
for hover and picking. Raw: `frames.txt`.

| Triangles | Camera, CPU p95 | Picking p95 |
| ---: | ---: | ---: |
| 1,152 | 0.5 ms | 0.2 ms |
| 12,800 | 0.9 ms | 0.1 ms |
| 51,200 | 1.9 ms | 0.1 ms |
| 204,800 | 0.4 ms | 0.2 ms |

The time between frames stayed at about 10 ms at every load: a refresh cap of the
display, not the limit of what the engine can draw. **WebKit does not report the CPU
time** in this script (the column is `NaN` in `frames.txt`); only Chromium's numbers
are shown. One 404 for a resource of the benchmark page was reported on the console
and not looked into.

## 5. The packaged Linux app, with no graphics card

Not the same machine: the desktop app on a GitHub-hosted Ubuntu 22.04 runner (two slow
cores, **no GPU, software rendering**), driven through its real web view (WebKitGTK) by
`scripts/drive-desktop-app.mjs`, 2026-10-02:

| | |
| --- | --- |
| Start page | 0.8 s |
| A box drawn | 2.1 s |
| After an edit, frames per second, one second at a time | 1.3, 6.1, then 45.8 |
| Project still there after a reload and after closing and starting again | yes, both |

For about two seconds after a change to the model, software rendering paints at a few
frames per second and then recovers. It is not explained yet; see
[`contributing/ci.md`](contributing/ci.md). On a real GPU this has not been measured, and it is not a claim of
this page.

## 6. The installed Linux app on Fedora, and Chromium on a slowed processor

2026-10-22, raw output and pictures in
[`bench/results/2026-10-22-linux-windows/`](../bench/results/2026-10-22-linux-windows), method in
its `machine.txt`. Fedora 41 x86_64 with the alpha `.rpm` installed by `dnf`, emulated on an
Apple-silicon Mac (so slower than a real PC), software OpenGL, driven by
`scripts/platform-check/run-fedora.sh`:

| | Before | After |
| --- | --- | --- |
| H.264 / VP9 decoder in the system's GStreamer | no / yes | no / yes |
| Intro film | never began; the window gave it up | plays: 0.3 s to 11.5 s in twelve seconds |
| Machine seen as drawing in software | no | yes: solid panels, cube on a canvas |
| Sketch, Items, Quick settings, Transform, Tools: click to third frame | 64 to 203 ms | 81 to 137 ms |
| First box | 2.6 s (a run of its own) | 0.7 s |
| Frames a second at rest | 54.6 | 49.2 to 53.2 |

The film was the fault found: as a blob GStreamer did not play it, and from Tauri's asset
protocol it did not load at all; from HTTP with byte ranges it plays (`apps/desktop/src-tauri/src/film.rs`).

Chromium (WebView2's engine), processor slowed four times, 1366 × 768, studio build before and after:

| | Before | After |
| --- | --- | --- |
| Tools: click to third frame | 50 to 114 ms | 57 to 128 ms |
| Frames a second while turning the view | 42.6 to 47.3 | 56.2 to 56.9 |

Within the noise for the tools; turning is faster with the orientation cube drawn on a canvas.
Neither run reproduces the slowness reported on a weak Windows laptop: that is a real graphics chip,
which nothing here has.

## What was not measured

- **A real GPU on Linux or Windows.** The runners draw in software. Frame times on
  them say nothing about a user's graphics card.
- **Weak hardware.** No ten-year-old laptop, no 4 GB machine. The tool for that,
  [Crosscheck](contributing/ci.md#crosscheck), has not run yet.
- **The 30-second first call of the geometry engine** on a very slow machine (its
  start-up includes loading the WebAssembly, with nothing reporting progress meanwhile).
- **Large assemblies**, other than the import corpus in `bench/src/large-import.ts`
  (1715 solids: see [ADR 0001](adr/0001-geometry-kernel.md) for what was found).
- **Memory.**
- **Windows.** The desktop app starts and the browser suite passes there
  ([`platforms.md`](platforms.md)); no timings were taken on Windows itself. Section 6 measures its
  engine (Chromium) on Linux. The check to run on Windows machines is in `scripts/platform-check/`.
- **A weak graphics chip.** The blur behind the panels and the canvas fill rate cost most there;
  nothing measured here has one.

## Measure it yourself

```bash
pnpm bench                                              # section 1
pnpm build && pnpm --filter @bezier/studio preview --port 4173
node scripts/load-budget.mjs                            # section 2
RUNS=3 node scripts/speed-suite.mjs http://localhost:4173/    # section 3
node scripts/frame-budget.mjs http://localhost:4173/bench.html   # section 4
```

If you do, please put the raw output and the machine's details in a new folder under
`bench/results/<date>-<machine>/` (copy `machine.txt` and fill it in,
including what was running), so that the numbers can be compared and not just quoted.
