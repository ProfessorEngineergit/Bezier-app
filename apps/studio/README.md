# @bezier/studio

The application shell: assembles the packages into the app that people use, in a browser and
inside the desktop apps.

At a glance

| | |
| --- | --- |
| **Layer** | The top. Nothing depends on it |
| **Depends on** | `core`, `kernel`, `solver`, `renderer`, `ui`, `storage`, `sim`, `lessons`; `react`, Tauri's JS API, `jspdf` and `svg2pdf.js` (drawings), `fflate` (zip) |
| **Tests** | 28 files, 1,951 lines of unit tests here; the app as a whole is tested by [`e2e/`](../../e2e/README.md) |
| **Read first** | `src/App.tsx` (the composition root), `src/session.ts` (one open document), `src/boot.ts` (storage, kernel) |
| **Explained in** | [How it works](../../docs/how-it-works/README.md), starting with [the path of one change](../../docs/how-it-works/01-the-path-of-a-change.md) |

## What lives here

Layout, the library and its projects, document lifecycle, the editor's workspaces, worker setup,
preferences, import and export, and the wiring between `@bezier/ui` and the packages beneath it.

Thin by design. If you are writing logic here that is about *shape*, it belongs in a package:
geometry in `core`, presentation in `ui`. The shell composes; it does not implement geometry. (It
is also big, 25,000 lines: a shell that holds a library, four workspaces and every dialog is not
small, and `App.tsx` is the one file allowed to be long, for a reason it states in
`scripts/check-structure.ts`.)

## Where things are

| | |
| --- | --- |
| `src/App.tsx` | The composition root: what is over the viewport right now |
| `src/session.ts` | One open document and everything that happens to it: **record, then apply**, rebuild, undo and redo, export |
| `src/boot.ts` | Starting: which storage (OPFS, IndexedDB or memory), the geometry engine, the solver |
| `src/use-*.ts` | The editor's state, by concern: `use-project`, `use-sketch`, `use-selection`, `use-shortcuts`, `use-library`, `use-go-home`, `use-prefs` ... |
| `src/Dashboard.tsx`, `LibraryPage.tsx`, `Library*.tsx`, `card-drag*.ts` | The start page: projects as cards, folders, search with `settings:` and other operators, drag with physics |
| `src/workspaces/` | Drawings, Visualize and the workspace menu |
| `src/simulation/` | The Simulation workspace and its worker (`sim-worker.ts`) |
| `src/lessons-host.ts` | What the editor gives `@bezier/lessons` (`LessonHost`) |
| `src/preferences.ts`, `PreferencesSheet.tsx` | Settings, and what is stored where |
| `src/formats/` | 3MF and mesh files |
| `bench.html`, `fill-bench.html` | The benchmark pages (`/bench.html` against a running build; [`docs/benchmarks.md`](../../docs/benchmarks.md)) |

## Running it

```bash
pnpm dev        # from the repository root; the app at http://localhost:5173
pnpm build      # the production build, to apps/studio/dist
pnpm preview    # serve that build (port 4173 with --port 4173)
```

Requires Node 22+ and pnpm 9+.

## Entry points

| File | |
| --- | --- |
| `index.html` | The page, and the favicon |
| `src/main.tsx` | Mounts React |
| `vite.config.ts` | Build config. Note the `optimizeDeps.exclude` for the `.wasm` modules: they load at runtime and are never bundled ([ADR 0003](../../docs/adr/0003-license-model.md)) |
