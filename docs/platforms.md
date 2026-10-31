# Platforms

How well Bezier runs on each system, how it is tested there, and what is known not to work yet.

## In short

- **macOS** runs best. It is the machine Bezier is built on and the one it is used on most.
- **Linux** runs well too, in browsers and as the desktop app.
- **Windows** is the weakest so far. It works, but it has had the least real use, and most of
  what we know about it comes from a virtual machine and from CI.

Because of that, the Windows app checks more and gives up sooner: where something looks wrong,
it stops and says so rather than carrying on with a model it is not sure of. In the first days
you may see more of those errors on Windows than anywhere else. Please
[report them](https://github.com/ProfessorEngineergit/bezier/issues/new/choose); each one is
something to fix.

If you use Windows and want to help, this is the place where help counts most. See
[CONTRIBUTING](../CONTRIBUTING.md).

## How each system is tested

| | Builds | Starts and is used |
| --- | --- | --- |
| **Linux, in browsers** | every push | Playwright, Chromium and WebKit, the whole browser suite |
| **Linux, the desktop app** | every push, and `desktop-smoke.yml` | The real binary in its web view (WebKitGTK), driven through `tauri-driver`: a new project, a box, reload, close and start again |
| **Windows, in a browser** | by hand or by label | Playwright Chromium (WebView2 is Chromium), the specs where the platform matters: keys, storage, library, navigation, window chrome |
| **Windows, the desktop app** | by hand or by label | Starts and draws the start page in CI; used by hand in a virtual machine |
| **macOS, the desktop app** | by hand, on a Mac | Used daily; the pictures in [`docs/assets`](assets) are made of the real window |

CI runs on GitHub's hosted runners, which have two slow cores and no graphics card. That is why
the browser suite is split into slices and why some tests are given minutes
([`contributing/ci.md`](contributing/ci.md)).

## Known limits

| | |
| --- | --- |
| **Windows** | Large imports (hundreds of megabytes of STEP) need a lot of memory; on a machine with little, Bezier asks before it starts. The background blur of panels is not drawn on some graphics setups, and a plainer surface is used instead. Simulation was not finished on a hosted Windows runner within its time limit. |
| **Linux** | The desktop web view has no OPFS, so projects live in IndexedDB; that works, and projects survive restarts. Lesson recording needs a video encoder the web view may not have; the Record sheet checks and says so. Without a graphics card the view is slow for a moment after an edit. |
| **macOS** | Builds are not notarised yet. |
| **All** | The desktop apps are not signed yet, so the system warns on first start. On Windows, Chrome and Edge may call the installer a virus; [why, and what signing needs](contributing/windows-signing.md). |

Measurements are in [`benchmarks.md`](benchmarks.md) and [`performance.md`](performance.md).
