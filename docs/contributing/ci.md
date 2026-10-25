# Continuous integration

What runs on a change, where, and what it can and cannot tell you. For what each
test *is*, see [`contributing/testing.md`](testing.md).

## The layers

| Layer | Runs | On | Tells you | Does not tell you |
| --- | --- | --- | --- | --- |
| **Checks**, structure, document links, lint, types, unit tests, build | every push and pull request | GitHub Actions, Linux | The code is consistent and its rules hold | That it works in a browser |
| **End to end**, the app in Chromium and WebKit, each in three parallel slices | every push and pull request | GitHub Actions, Linux | The app's behaviour in a real browser, including storage and workers | Anything about the packaged desktop app |
| **Desktop app on hardware classes**, Crosscheck | a maintainer's request or a label, see below | A disposable VM on the maintainer's own hardware, Linux only | The Linux app builds, starts, can be clicked through, and how long it takes on a slow, an ordinary and a fast machine | Windows, macOS, a real GPU (below) |
| **Release build**, Windows, macOS, Linux installers | by hand | GitHub Actions, one runner per system | The app builds and packages on each system, unsigned unless signing secrets are set | That it starts; nothing runs it |

The first two decide whether a pull request can merge. **Crosscheck is an extra
signal, not a gate**: it can be slow, it needs the maintainer's machine to be on,
and it checks things the first two cannot.

## The pictures

[`screenshots.yml`](../../.github/workflows/screenshots.yml) is not a check: it makes the pictures in
[`assets/`](../assets/README.md) on Linux and Windows runners (the app in 11 states, and the real
window in four) and leaves them as artifacts to be looked at before anything is committed.
It is started by hand, for one system at a time (`all`, `linux`, `windows`, `windows-window`,
`windows-tour`). On a runner with no graphics card the Visualize workspace and the simulation take
minutes, so the tour keeps them last and gives them the time they need.

## Crosscheck

[Crosscheck](https://github.com/ProfessorEngineergit/Crosscheck) builds a pull
request in a throw-away virtual machine, starts the app, works through a short
script of clicks (`crosscheck.yaml`, at the repository root), measures how long the
start takes from outside the VM, and reports back on the pull request as one check
and one comment. The VM has no credentials and no route to the maintainer's
network, and is destroyed afterwards with a receipt saying so. Code from a pull
request is treated as hostile, including the maintainer's own.

`crosscheck.yaml` is always read from the base commit of the pull request, so a
pull request cannot loosen its own checks. A change to the file takes effect after
it is merged.

### What starts a run

| | |
| --- | --- |
| Nothing | Static checks only |
| Maintainer approves the exact commit | A run on the ordinary class (`mainstream`), if the maintainer's policy waits for approval |
| Label `crosscheck:run` | `office` and `mainstream` |
| Label `crosscheck:matrix` | All five classes |
| Comment `/crosscheck run --presets potato` | The classes named (maintainers only) |

You do not need to do anything for a contribution to be reviewed. Crosscheck is
worth requesting for a pull request that touches the renderer, the app shell or the
desktop wrapper, because those are what a browser test cannot see.

### The hardware classes

| Class | Cores | Speed | Memory | Screen | Network | Stands for |
| --- | --- | --- | --- | --- | --- | --- |
| `potato` | 2 | 0.3 | 4 GB | 1366 × 768 | 3G | A ten-year-old laptop |
| `office` | 2 | 0.55 | 8 GB | 1920 × 1080 | busy Wi-Fi | An office or library PC |
| `mainstream` | 4 | 1.0 | 16 GB | 1920 × 1080 at 125 % | DSL | A current laptop |
| `highend` | 8 | 1.4 | 32 GB | 2560 × 1440 at 125 % | fibre | A good desktop |
| `insane` | all | all | all | 4K at 150 % and 1080p | LAN | Exposes races and HiDPI bugs |

Speed 1.0 is one mid-range desktop core from 2024. A host that cannot supply a
class (too little memory, no such CPU) is told to downgrade, and **the report says
which classes were measured, which were simulated and which were cut down**.

### What a build costs on each class

Measured on an Apple M1 Max, clean target directory, 2026-10-01; the cost on a class
is worked out from it, and is not yet measured on a real class:

| | Measured here | `potato` | `office` | `mainstream` | `highend` |
| --- | --- | --- | --- | --- | --- |
| Debug build of the desktop shell | 29 s on 10 cores, 167 CPU-seconds | ~4.6 min | ~2.5 min | ~42 s | ~21 s |
| **Release build** (what the script builds) | 75 s on 10 cores, 227 CPU-seconds | **~7.7 min** | ~4.2 min | ~1.6 min | ~50 s |
| of which the final link (LTO, one thread, 1.4 GB of memory) | 48 s | 160 s | 88 s | 48 s | 34 s |
| Frontend build | 2 CPU-seconds | seconds | seconds | seconds | seconds |

The estimate divides the parallel part of the work by the cores and the speed, and
the single-threaded link by the speed alone, and takes an M1 Max performance core
as equal to the reference core. If the reference core is slower, multiply. The
link runs on one core whatever the class has, and needs 1.4 GB, which fits `potato`
(4 GB) but not with much to spare next to a desktop.

The limit is a fixed 15 minutes for the whole build in Crosscheck 0.1.0. On
`potato` the build of the shell, about 8 minutes, is only part of it: the
class's 3G network adds 300 ms to every request and drops 2 % of connections while
`pnpm install` fetches packages, because the build runs through the same shaped
proxy as the app. Whether `potato` finishes inside 15 minutes is the first thing
a real run will show.

### What it cannot tell you

- **Windows and macOS.** Crosscheck has no Windows image yet (item 1 on its
  roadmap) and macOS needs Apple hardware. For those, the release build covers
  that the app builds, and nothing runs it.
- **Real GPU performance.** The VMs draw in software. A time measured there is
  about start-up, layout and the geometry engine, **never about frame rates on a
  user's graphics card**. Frame times are measured with `pnpm bench:frames` and
  `apps/studio/fill-bench.html` on real hardware, see [`performance.md`](../performance.md).
- **Anything the script does not click.** The six steps in `crosscheck.yaml`
  cover starting, opening a project, zooming, one panel, going Home and
  Settings. A model is not built.
- **A pass is not a review.** The status comes from what the host measured and saw,
  never from a model's opinion; a green check says the script worked on that class.

### One window, one expected finding

The window is created at 1440 × 900 and `potato` has a 1366 × 768 screen, so the
window does not fit it. The desktop shell sets no minimum size and no maximum, so
this is expected to be reported on `potato` until the window is sized to the screen.

## Where each system is checked today

| System | Builds | Starts and is clicked through | Measured on slow and fast hardware |
| --- | --- | --- | --- |
| Linux, desktop app | `desktop-smoke.yml`; release build; Crosscheck | The start page opens, and `scripts/drive-desktop-app.mjs` drives new project, extrude, reload and restart (below); Crosscheck's click-through has not run yet | Crosscheck (not yet run) |
| Linux, in a browser | — | Playwright, WebKit and Chromium | — |
| Windows | `desktop-smoke.yml` (by hand or label): built in 7.7 min on `windows-latest` | The start page opens, checked once (below); the browser suite's platform-sensitive specs run in Chromium (WebView2's engine) with `e2e-windows.yml`, 72 specs in 20 min, green on 2026-10-02; the packaged app is not clicked through | **Nothing** |
| macOS | Release build, by hand | **Nothing** (checked by hand before a release) | **Nothing** |
| Android, iOS | **Not built** | — |, |

## Starting the app on Windows and Linux (first runs, 2026-10-01)

`desktop-smoke.yml` builds the desktop app unsigned, starts it, and looks at what
came up. On GitHub's hosted runners:

| | Build | What was seen |
| --- | --- | --- |
| Windows 11 (`windows-latest`, WebView2) | 461 s | The start page, with menu bar, sidebar and the brand font, in a window that fits the 1024 × 768 screen. Window title `Bezier`, a web view process behind it. |
| Ubuntu 22.04, virtual display, no GPU (WebKitGTK) | 211 s (and 3 to 14 min of packages, which varies a lot) | The start page with menu bar and brand font, 1480 colours on screen, window title `Bezier`. |

### The Linux check was green with a black screen, and then red for the wrong reason

The first version of the Linux check asked whether the process was still alive after
20 seconds. It was, and the screen was entirely black. Counting the colours in the
picture made it fail, which is what it should do; why it failed took three more runs:

1. A bare X server has no window manager. Adding one (`openbox`) changed nothing: the
   window stayed a 10 × 10 pixel stub and was never shown.
2. `gdb` on the running process showed the main thread inside `g_dbus_proxy_new_sync`,
   called from `libgtk-3`, in a `poll` with a 25 000 ms timeout. GTK makes a
   synchronous D-Bus call before it shows the window, and a bare runner has no session
   bus to answer. The window appears when the call times out.
3. Started inside a session bus (`dbus-run-session`), as every desktop session does,
   the app draws at once.

So this was the test setup, not the app. It is also a real, if narrow, behaviour:
**on a Linux desktop without a D-Bus session (a minimal window manager started from
a bare X session, some containers), the window takes 25 seconds to appear.** That is
GTK's, not ours, and is worth a line in the Linux notes rather than a fix.

No web view workaround is needed. The app was started four ways (with nothing
extra; with the DMA-BUF renderer off; plus compositing off; plus forced software GL)
and drew in all four, 1470 to 1480 colours each. The check therefore starts it
as plain pixels, and fails when the picture has ten colours or fewer, keeping the stacks and
the X tree for the report.

## What driving the real Linux app showed (2026-10-01)

The browser suite runs Playwright's WebKit, which is not the engine the Linux app
ships. The packaged app was built in an Ubuntu 22.04 container and driven through
`tauri-driver` (`scripts/drive-desktop-app.mjs`, now part of `desktop-smoke.yml`).
In its real web view (WebKitGTK):

- **It works end to end.** New project, extrude a box, back to the projects, reload,
  close the app and start it again: the project is there each time. 0.3 s to the
  start page, 0.5 to 0.9 s to a drawn box.
- **There is no OPFS** (`navigator.storage` does not exist), so projects live in
  IndexedDB, and there is no `SharedArrayBuffer`. The app handles both; its
  "Saving to IndexedDB" notice is now shown only where OPFS is offered and fails.
- **Recording does not work in this web view without an encoder.** `MediaRecorder`
  accepts H.264 and returns an empty file. The Record sheet records a small canvas for a
  moment to find out, and says so instead of failing an hour into a lesson.
- **Software rendering is slow for about two seconds after a change to the model.**
  With no graphics card the page ran at about 50 fps empty and about 4 fps for two
  seconds (sometimes four) after a geometry edit, then back to 50. The main thread was not
  blocked (timers drifted 11 ms on average) and the app issued seven draw calls, so it is
  the web view painting, not the app drawing. It is not animations, fonts or
  stored data, and backdrop blur is a small part at most: with glass set to `solid` the
  slow stretch was one to two seconds shorter, not gone. Not explained yet. Whether it exists on a real GPU is the first thing to measure
  on a real machine, and Crosscheck's slow classes are the place to see how long it lasts.

Related, seen on the CI runners (two slow cores, no graphics card): the Visualize
workspace's test, which changes environments and materials ten times, needs more
than four minutes there and ten at the outside, because every change compiles a
heavy PBR shader on the CPU and the page does not answer meanwhile. On a real GPU
this is a blink. How it feels on a machine with weak graphics is a thing to measure
on Crosscheck's slow classes.

And on Windows (`windows-latest`, two cores): with two test workers the geometry
engine's 30-second watchdog fired ten times on a box extrude that takes milliseconds,
and twelve of 72 specs failed; with one worker the same specs ran with no restarts. So
that was starvation, not a Windows fault. It does show that the engine's first call
(which includes loading its WebAssembly) has a 30 s limit with nothing reporting
progress inside it. On a very slow machine that is the number to watch: Crosscheck's
`potato` class (0.3 speed) is where to see how close start-up comes to it.

## Running it yourself

```bash
uvx --from git+https://github.com/ProfessorEngineergit/Crosscheck crosscheck demo
```

runs a complete check of a *simulated* app in a *simulated* VM, with no GitHub, no
KVM and no keys, and serves the dashboard and the agent interface on
`http://127.0.0.1:8750`. It is the way to see what a report looks like. A real run
needs a Linux machine with KVM, which is what the maintainer is setting up;
Crosscheck's own documentation covers doing it.
