# ADR 0006: Desktop packaging: Tauri 2

- **Status:** Accepted (direction), not yet scaffolded
- **Date:** 2026-08-04

## Context

Mac, Windows, and Linux desktop builds are a stated product goal. The modellers people
compare it with are native apps; matching their feel while shipping a browser app means the desktop build
cannot feel like a browser in a costume.

The web app remains the primary target, it is the distribution advantage (open a
URL, start modelling, no install). Desktop is an *additional* delivery of the same
application, not a fork.

## Decision

Ship desktop builds with Tauri 2, wrapping the same `apps/studio` build output.
Scaffold it at M1, not now.

## Rationale

Tauri over Electron:

- **Size.** Tauri uses the OS webview; Electron bundles Chromium. Our `.wasm`
  payload is already ~5 MB brotli, we should not add 150 MB of browser to it.
  A Tauri binary is single-digit MB.
- **Memory.** Meaningful for an app that will hold a geometry kernel and a scene
  graph in RAM.
- **Filesystem.** Tauri gives real, native file dialogs and paths, which directly
  serves the biggest weakness in [ADR 0005](0005-local-first-storage.md): OPFS is
  browser-profile-scoped and can be wiped by clearing site data. On desktop,
  documents are just files, and that trust problem disappears.
- **Rust.** If we later want native-speed work outside the WASM sandbox, a native
  OCCT build, multi-threaded tessellation, faster file I/O, Tauri's backend is the
  natural home. `occt-wasm` publishes a Rust crate for exactly this case.

Accepted cost, the webview is not one browser. Tauri renders in WKWebView on
macOS, WebView2 (Chromium) on Windows, and WebKitGTK on Linux. WebKitGTK is the
weak link: historically slower and buggier for WebGL and WASM. This means:

- The Safari/WebKit testing discipline from [ADR 0005](0005-local-first-storage.md)
  is not optional, it covers macOS desktop *and* Linux desktop *and* Safari.
- WebGL and WASM feature detection must degrade gracefully with a clear message,
  never a blank viewport.
- Benchmark WebKitGTK early. If it proves unworkable for the renderer, the fallback
  is Electron for Linux only, ugly, but better than a broken Linux build.

## Why not now

Scaffolding Tauri requires the Rust toolchain, platform SDKs, and code-signing
setup on three operating systems, days of yak-shaving that produce a window
containing an app that does not exist yet.

The prerequisite is that the web app works. Adding Tauri at M1 costs roughly the
same as adding it now and is informed by an app that actually runs.

What we do now instead (cheap, and prevents painting ourselves into a corner):

1. Keep `apps/studio` free of browser-only assumptions in its persistence layer -
   storage sits behind an interface with an OPFS implementation now and a native-fs
   implementation later ([ADR 0005](0005-local-first-storage.md)).
2. No hard dependency on `window.location`, service workers, or same-origin
   assumptions in application logic.
3. Keep the `.wasm` artifacts as separate loadable files with a configurable base
   URL, required for LGPL compliance anyway ([ADR 0003](0003-license-model.md)),
   and it is also what lets the desktop build load them from disk.

## Consequences

- One codebase, four delivery targets: web, macOS, Windows, Linux.
- Code signing and notarisation will be needed for macOS and Windows. Apple
  Developer Program membership and a Windows signing certificate are real costs
  and real calendar time, start them before they are urgent.
- CI gains a matrix build across three OSes at M1. Currently CI is Linux-only.
- Auto-update is a Tauri built-in but requires a signing key and an update server.
  Decide at M1 whether desktop auto-updates or points users at releases.

## MEASURED: the renderer is not the problem, the presentation cadence is (2026-08-06)

The open question below was "can a webview hold the frame budget", and the
honest answer was that nobody knew. It is now measured, with
[`scripts/frame-budget.mjs`](../../scripts/frame-budget.mjs) driving
`apps/studio/bench.html`, a bare page with a synthetic mesh and no application
around it.

Frame gap at p95, over a 178× range of load, on the same machine:

| Triangles | Chromium | WebKit | CPU per frame (WebKit) |
| --- | --- | --- | --- |
| 1,152 | 9.2 ms | 34.0 ms | 1.0 ms |
| 12,800 | 9.3 ms | 34.0 ms | 1.0 ms |
| 51,200 | 9.2 ms | 34.0 ms | 1.0 ms |
| 204,800 | 9.3 ms | 34.0 ms | 1.0 ms |

Picking stayed at ≤ 0.1 ms throughout, against an 8 ms budget, with a third of
the rays hitting geometry, so those numbers are over real work rather than over
misses.

The load changes nothing. A renderer that is working hard gets faster when
given less; this one reports the same figure whether it is handed a thousand
triangles or two hundred thousand. So the gap is a presentation cap, not a
limit on how much the engine can draw, and the drawing itself costs about a
millisecond of CPU at the largest size tested.

The same page inside the packaged Tauri app agrees with the Playwright WebKit
figure: 33–35 ms, which is 30 fps.

### What follows

The decision stands. ADR 0007's budgets are met with roughly an order of
magnitude of headroom in every engine, so nothing here argues for Electron or for
a native rewrite, neither would make a 1 ms frame cheaper.

But 30 fps is not the feel this project is aiming at, and that is now a
specific, bounded problem rather than a vague worry: find why the WebKit webview
presents at half rate. It is a cap to be lifted, not a wall to be worked around,
and it must be answered before the desktop build is put in front of anyone.

Worth noting for whoever picks this up: the first version of this benchmark ran
headless and reported 86 ms frames. That was software rasterisation with no GPU -
a confident measurement of the wrong thing. The runner launches headed for that
reason.

## Open questions

- **Why does the WebKit webview present at 30 fps when a frame costs it 1 ms?**
  The measurement above turns this from "is a webview fast enough" into a narrow
  question about compositing and vsync.
- Does WebKitGTK handle our renderer acceptably? Still unmeasured, the figures
  above are macOS. Benchmark before committing to a Tauri Linux build.
- Do desktop builds bundle the `.wasm` artifacts or download them on first run?
  Bundling is better for offline-first; it grows the installer.
- Is the desktop build the paid/commercial delivery, or identical to web? A
  licensing and packaging question, not a technical one.
