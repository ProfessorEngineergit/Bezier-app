# Pictures

What Bezier looks like, on each system, and how every picture here is made, so that it can
be made again. A picture that cannot be redone goes stale; these can.

## Two kinds, and why they are not the same

| | **The tour** | **The real window** |
| --- | --- | --- |
| What | The app in **11 fixed states**, in a browser engine | The **packaged app**, with its own title bar, menu and window buttons |
| Engine | **Chromium on every system.** Playwright's WebKit draws the orientation cube flat and mirrored (the real macOS and Linux windows draw it right), so pictures from it would show a fault that is not the app's | Each system's own web view: **WKWebView** (macOS), **WebView2** (Windows), **WebKitGTK** (Linux) |
| Size | 1440 × 900 at 2x | the app's window, at 1x (Linux, Windows) or 2x (macOS) |
| States | start page, editor, a selected edge, the history, light theme, section view, drawings, Visualize, simulation, settings, a lesson | start page (empty), editor with a box, drawings, settings |
| Made by | [`e2e/tour/tour.spec.ts`](../../e2e/tour/tour.spec.ts) | [`mac-window.sh`](../../scripts/capture/mac-window.sh) (macOS), [`windows-window.ps1`](../../scripts/capture/windows-window.ps1) (Windows), [`drive-desktop-app.mjs`](../../scripts/drive-desktop-app.mjs) (Linux) |
| Good for | what the app can do | what it is like to have on **your** system |

## Where they come from

| Set | Made on | By |
| --- | --- | --- |
| Tour, **macOS** | a Mac (Apple M1 Max) | `TOUR=1 SHOTS_DIR=out SHOTS_OS=macos pnpm exec playwright test --project=tour` |
| Tour, **Linux** | a GitHub-hosted Ubuntu 22.04 runner | [`screenshots.yml`](../../.github/workflows/screenshots.yml), job *Tour, Linux* |
| Tour, **Windows** | a GitHub-hosted Windows runner | `screenshots.yml`, job *Tour, Windows* |
| Window, **macOS** | the same Mac, an app built with its own identifier (an empty profile of its own), driven with the keyboard through System Events | `scripts/capture/mac-window.sh` |
| Window, **Linux** | a GitHub-hosted Ubuntu 22.04 runner, a virtual display (1440 × 900), the real binary through `tauri-driver` | `screenshots.yml`, job *Window, Linux* |
| Window, **Windows** | a GitHub-hosted Windows runner at 1920 × 1080, the real binary driven with the keyboard | `screenshots.yml`, job *Window, Windows* |

Dated **2026-10-02**. The apps were built from the repository at that day's head; the unsigned
builds are not signed. The tour is dark; the real windows follow each system's own theme: macOS and
the Linux run were dark, the Windows runner is light, and the pictures show what each did.

## The files

### The tour

`screenshots/<system>/<system>-NN-<state>.webp`. The same eleven for each system, **except Windows, which has ten: there is no 09 (simulation)**. On the GitHub-hosted Windows runner the solve did not finish within the tour's 25-minute limit (on a Mac and on a Linux runner it takes seconds to a few minutes). Whether that is the runner's two slow cores or something in the simulation on Windows has not been looked into; it is listed in [`platforms.md`](../platforms.md). No picture from another system stands in for it.

| | State |
| --- | --- |
| 01 | The start page, with four projects as cards |
| 02 | The editor on a filleted part |
| 03 | An edge selected: the gizmo, the value, the stable name of what was picked at the bottom |
| 04 | The history ("Items"): Sketch, Extrude, Fillet, Fillet |
| 05 | The same, in the light theme |
| 06 | A section view |
| 07 | Drawings: four projected views and a title block |
| 08 | Visualize: copper in warm studio light |
| 09 | Simulation: a bar fixed at one end, loaded on its face, von Mises stress |
| 10 | Settings, Interaction |
| 11 | A lesson (Learn) |

### The real windows

`app-windows/<system>-window-N-<state>.webp`: 1 start (an empty library), 2 editor (a box),
3 drawings, 4 settings.

### Hero and diagrams

`hero/hero-dark.webp` and `hero-light.webp` (the README's picture; tour 04 and 05 of macOS) and
`diagrams/*.svg`: the architecture, the path of one change, the stable references and the repositories.
The diagrams are drawn as self-contained dark cards, so they look the same on GitHub's light and dark themes.

## Rules for pictures in this repository

- **WebP, at most 2400 px wide, quality 80** (`scripts/capture/optimise.mjs`; a picture is only ever made
  smaller, never larger): 12 to 195 KB where the PNG is up to 2 MB. **One picture is at most 400 KB and all of them together at most 12 MB**
  (`pnpm check:links` enforces both): a picture in git is there for good.
- **Look at every picture before it is committed.** Making them is cheap, undoing one in the history is
  not.
- **A picture says what it is and where it was made.** If one cannot be made on a system, the table says so;
  it is not replaced by a picture from another.
- Nothing personal in a picture: the real windows are made on an **empty profile**.

## Make them again

```bash
# the tour, here
TOUR=1 SHOTS_DIR=out SHOTS_OS=macos pnpm exec playwright test --project=tour

# the real macOS window (needs Screen Recording and Accessibility for the terminal)
pnpm --filter @bezier/desktop exec tauri build --bundles app --config '{"identifier":"app.bezier.shots"}'
scripts/capture/mac-window.sh apps/desktop/src-tauri/target/release/bundle/macos/Bezier.app out

# Linux and Windows: run the "Screenshots" workflow and download its artifacts

# then
node scripts/capture/optimise.mjs out docs/assets/screenshots/macos
```

## What these pictures found

Taking them is also a test, and these were found by looking:

- On Linux the select boxes were **white with light text** and could not be read, because the page did not say
  which colour scheme it was in. Fixed, with a test.
- The Linux app's web view has **no OPFS**, so it keeps projects in IndexedDB; the pictures do not show it,
  [`platforms.md`](../platforms.md) does.
- Playwright's WebKit draws the orientation cube wrong (see above): the reason the tour is Chromium.
