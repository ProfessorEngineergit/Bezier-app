# Testing

What is tested how, what each command runs, and where a new test goes. The
short version: **`pnpm check` before every change, `pnpm e2e` when the change
touches the renderer, storage or the app shell.**

## The commands

| Command | What it runs | Takes | When |
| --- | --- | --- | --- |
| `pnpm check` | structure, document links, lint, typecheck, unit tests | about 10 seconds | Always, before proposing anything |
| `pnpm e2e` | the whole app in Chromium | a few minutes | Renderer, storage, shell, anything the browser owns |
| `pnpm e2e:webkit` | the same, in WebKit | a few minutes | Before a release; CI runs this one |
| `pnpm lint:fix` | formats and fixes lint | seconds | When `pnpm check` complains about formatting. Never format by hand |
| `pnpm bench` | kernel corpus: load, rebuild, tessellation | a minute | Touching the kernel or the rebuild path |
| `pnpm bench:frames` | the frame budget of the webview | a minute | Touching the renderer |
| `pnpm --filter @bezier/desktop check` | `cargo fmt` and `cargo check` of the Mac/Windows/Linux shell | a minute | Touching `apps/desktop/src-tauri` |

Node 22 or newer and pnpm 9 or newer. `pnpm install` once.

What runs on a pull request, and where, is in [`contributing/ci.md`](ci.md).

## The layers

### 1. Static checks: in `pnpm check`

| Check | Script | Catches |
| --- | --- | --- |
| Structure | `scripts/check-structure.ts` | A package without a README, a file past the size limit, a name that breaks the convention |
| Document links | `scripts/check-doc-links.ts` | A relative Markdown link to something that does not exist, an absolute path from one machine, a public document linking into private ones |
| Lint | Biome, `biome.json` | Style, correctness, and the **layer boundaries**: `studio → ui → renderer → core → {kernel, solver}`, downward only, and `occt-wasm` / `planegcs` only in their own package |
| Types | `tsc` in every package | Everything TypeScript can see |

### 2. Unit tests: in `pnpm check`

Vitest, in Node. Every package keeps its tests next to the code as
`*.test.ts` (`vitest.config.ts` picks up `{packages,apps}/*/src/**/*.test.ts`).
Every package has them, and `apps/studio` too.

The geometry kernel is never mocked. Integration tests run against the real
WebAssembly module. Mocking a kernel proves nothing, and three real bugs here
were found precisely because the tests were real. Anything that is pure logic
- a naming rule, a spring, a search parser, a slider's magnet, is tested as
pure logic and has no DOM in it. If a rule can only be tested through the
browser, that is usually a sign the rule is tangled up with it.

### 3. End-to-end tests: `pnpm e2e`

Playwright, in a real browser, against the dev server (`e2e/`, one `*.spec.ts`
per area: sketching, gizmos, library, import, export, undo and reopen, …).
They exist because three real bugs shipped past a fully green `pnpm check` -
an OPFS write that deadlocked, a double boot under StrictMode, a camera that
reset on every rebuild, and none was reachable from Node. **Anything the
browser owns needs a browser test:** OPFS, workers, WebGL, React effects,
layout and pointer behaviour.

- No retries (`retries: 0`). A flaky suite teaches everyone to re-run until
  green and then ignore real failures. If a test is flaky it is broken; fix it.
- A fixed 1280 × 800 viewport, so a test can compute where a face lands.
- **WebKit on Linux is not WebKit on a Mac.** The build Playwright runs there has
  no `navigator.storage` (so no OPFS: projects live in IndexedDB), no
  `MediaRecorder` (lesson recording), and presents its first frame later. Tests
  that need those skip themselves with the reason (`test.skip(…)`) rather than
  fail; picks and camera reads wait for frames (`afterFrames` in `e2e/app.ts`)
  instead of a fixed time. The Linux desktop app's web view is this engine's
  relative, so the same limits are the app's on Linux.
- **`e2e/tour/` is not a test.** It photographs the app in 11 states for the documentation; it has
  its own Playwright project (`TOUR=1`) and stays out of `pnpm e2e` ([`assets/README.md`](../assets/README.md)).
- Fixtures are in `e2e/fixtures-files/`; shared helpers in `e2e/app.ts` and
  `e2e/fixtures.ts`.
- WebKit is not optional: it is Safari, the macOS desktop webview, and (as
  WebKitGTK) the Linux one, and it is the engine most likely to differ on OPFS
  and WebAssembly.

### 4. Measurements: not pass/fail

Absolute times belong to the machine, so these report numbers to be compared
run to run rather than asserting a threshold that is true on one laptop.

| What | Where | Records into |
| --- | --- | --- |
| Kernel: cold load, rebuild, tessellation | `bench/` (`pnpm bench`) | [`performance.md`](../performance.md) |
| Frame budget: orbit and pick on a synthetic mesh | `apps/studio/bench.html` (`pnpm bench:frames`) | [`performance.md`](../performance.md) |
| What a frame costs as the drawing buffer grows | `apps/studio/fill-bench.html` | [`performance.md`](../performance.md) |
| The waits of an ordinary session | `scripts/speed-suite.mjs`, `scripts/load-budget.mjs` | [`benchmarks.md`](../benchmarks.md) |

A claim that something is faster needs a number from one of these, with the
engine and machine named.

### 5. Spikes: answers to questions

`tools/spikes/` holds throwaway experiments that answer an architecture question by
running it ("do OCCT face hashes survive a rebuild?"). They are not tests and
are not run in CI. The result goes into the relevant ADR in [`adr/`](../adr/); the
spike stays so the result can be reproduced.

## Where does my test go?

| You changed | Add |
| --- | --- |
| A rule in `packages/*` | A `*.test.ts` beside the file |
| Something that touches the kernel | A test against the real kernel, beside the code |
| A pure helper in `apps/studio` | A `*.test.ts` beside it, with no DOM |
| What a user sees or does: a panel, a drag, a gizmo, a shortcut | A spec in `e2e/` |
| Storage, workers, anything asynchronous in the browser | A spec in `e2e/`, WebKit included |
| Something with a speed budget | A number in [`performance.md`](../performance.md) from the matching tool above |

## Gaps

- `crates/sim` (the native simulation) builds with `cargo` but has no tests of
  its own yet; the simulation is covered by `packages/sim` unit tests and
  `e2e/workspaces/simulation.spec.ts`.
- Drag-and-drop on the start page and the slider's pointer behaviour are
  covered by unit tests of their rules and by hand, not yet by an `e2e` spec.
- The Mac app's webview is checked by hand before a release; there is no
  automated test of the packaged app.
