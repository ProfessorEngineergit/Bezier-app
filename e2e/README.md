# End-to-end tests

The app in a real browser, against the real geometry kernel (never mocked). Not part of
`pnpm check`, which is the fast loop; see [`docs/contributing/testing.md`](../docs/contributing/testing.md) for what is tested
how, and [`docs/contributing/ci.md`](../docs/contributing/ci.md) for where it runs.

```bash
pnpm e2e                    # Chromium
pnpm e2e:webkit             # Chromium and WebKit (what CI runs, each in three slices)
pnpm exec playwright test shortcuts library      # only these specs
```

## Where the specs are

| Folder | What it covers |
| --- | --- |
| `modeling/` | Features, gizmos, selection, bodies, inspection |
| `sketch/` | Drawing, constraints, curves, sketch planes |
| `files/` | Projects on disk, import and export, undo after reopening |
| `library/` | The start page, channels, the wiki, the community store, the film |
| `view/` | Navigation, the view cube, the viewport, shortcuts, performance |
| `workspaces/` | Drawings, Visualize, Simulation |
| `nib/` | Nib and the lessons |
| `connected/` | Collaboration, the MCP link, plugin development |
| `regressions/` | Findings from audits, one test each |

Helpers (`app.ts`, `fixtures.ts`) and the files the specs read (`fixtures-files/`) stay at the top.

## Helpers worth knowing (`app.ts`)

| | |
| --- | --- |
| `openApp(page)` | Starts the app and waits until the library has **loaded**; opens a project or makes one |
| `addBox(page)` | The starter box, through the rail, the way a person does it |
| `screenPointOf(rect, world)` | Where a world point lands on screen. Computed with the viewport's own framing, not guessed |
| `pickAt(page, world)` | Click a world point and return the name of what was selected |
| `afterFrames(page)` | Two animation frames: what is on screen is what a click resolves against |

## Rules this suite has learned

- **Wait for the state, not for a time.** A fixed `waitForTimeout` passes on a laptop and fails on a
  slow CI runner. Poll for the end state (`expect.poll`, `toPass`).
- **Say why a test skips.** WebKit on Linux has no OPFS and no `MediaRecorder`: such tests
  `test.skip(...)` themselves with the reason, rather than fail or vanish.
- **Pictures and downloads go to `test.info().outputPath(...)`**, never to `/tmp`: the suite runs on
  Windows too.
- **CI has more time**, on purpose (`playwright.config.ts`): a limit that means "something is wrong"
  on a laptop means "it is still working" on a runner with two slow cores.

## `tour/` is not a test

`tour/tour.spec.ts` photographs the app in 11 fixed states, for the documentation: how, and what
the pictures are, in [`docs/assets/README.md`](../docs/assets/README.md). It has its own project and
stays out of `pnpm e2e`.
