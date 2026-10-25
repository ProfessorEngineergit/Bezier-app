# @bezier/desktop

The same application, in a native window with a native menu bar and file dialogs, on
macOS, Windows and Linux.

Not a fork and not a port: Tauri loads the built `apps/studio` output, so there
is one codebase and four delivery targets ([ADR 0006](../../docs/adr/0006-desktop-packaging.md)).
`src-tauri/src/main.rs` only assembles native concerns. `menu.rs` owns the macOS
menu and `bridge.rs` translates its commands into existing studio actions.

## Why this exists at all

Two reasons, and the second is the real one.

It feels like an application. A native window, a dock or task-bar icon, a menu bar,
Settings under `Cmd+,` (`Ctrl+,` on Windows and Linux), and real open/save dialogs. The menu routes
Undo, Redo, Duplicate, selection and export through the same command paths as
the web UI, so desktop is not a second implementation of the editor.

Documents become files. OPFS is scoped to the browser profile, so clearing
site data deletes a user's work, the single biggest trust problem in the web
build ([ADR 0005](../../docs/adr/0005-local-first-storage.md)). On the desktop
they are just files, and that problem disappears. `StorageBackend` is five
methods and sits behind an interface precisely so this is a swap rather than a
rewrite.

That swap is not written yet. The desktop build currently uses the same OPFS
backend as the browser, inside the webview. It works, and it does not yet deliver
the reason for building it.

## Running it

```bash
pnpm --filter @bezier/desktop dev
```

Starts the Vite dev server and opens it in a native window. Hot reload works.

```bash
pnpm --filter @bezier/desktop build
```

Builds the web app, compiles the Rust binary, and produces the installers for the system it runs
on under `src-tauri/target/release/bundle/` (a `.app` and a `.dmg` on macOS, an NSIS installer on
Windows, a `.deb` on Linux). `tauri build --no-bundle` makes only the binary.

The first Rust build takes several minutes and compiles a few hundred crates.
Later ones are quick.

```bash
pnpm --filter @bezier/desktop check
```

Checks and formats the Rust wrapper without rebuilding the app bundle.

## On each system

| | You need | Notes |
| --- | --- | --- |
| **macOS** | Rust, Xcode command line tools | Builds are unsigned unless signing secrets are set (`release.yml`); from macOS 13 |
| **Windows** | Rust (MSVC toolchain), the WebView2 runtime (already on Windows 11) | NSIS installer, per user |
| **Linux** | Rust and `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf` | The web view needs a **D-Bus session**: without one GTK waits 25 seconds before it shows the window (a bare virtual display needs `dbus-run-session`). The Linux web view has no OPFS, so projects are kept in IndexedDB |

How each is tested, and what is not: [`docs/platforms.md`](../../docs/platforms.md). The real app on Linux
can be driven end to end with `scripts/drive-desktop-app.mjs` (through `tauri-driver`).

## The content security policy

`tauri.conf.json` allows `'unsafe-eval'` in `script-src`. The constraint solver (planegcs, built
with Emscripten's embind) makes its function wrappers with `new Function` when it starts, and
without `'unsafe-eval'` that throws. The app then ran the stand-in solver: constraints were kept
but never solved, dragged rectangles lost their right angles and dimensions did not hold (audit
F-022, F-049, 18 October 2026). The browser build has no such policy, which is why every browser
test passed. Scripts still come only from the app itself (`'self'`). Removing `'unsafe-eval'` needs
a planegcs built with `-sDYNAMIC_EXECUTION=0` first.

## No TypeScript here

This package is a Rust binary and a config file. It is excluded from the
workspace `typecheck` and exempted from the `tsconfig.json` requirement in
`scripts/check-structure.ts`, both explicitly, because the alternative is an
empty `tsconfig.json` added to satisfy a check, which teaches everyone that the
check is a formality.

## Icons

Generated from the brand mark, not committed by hand:

```bash
pnpm --filter @bezier/desktop icons
```

## Not done yet

- **Signing and notarisation.** Needs an Apple Developer account and a
  Developer ID certificate, calendar time rather than code, and the one part of
  this nobody else can do. Until then the build runs locally and Gatekeeper will
  refuse it on anyone else's machine.
- **Native project storage**, as above. Geometry import and STEP/STL export use
  native dialogs now; the project's journal still lives in the webview's OPFS.
- **Auto-update.** Tauri has an updater; it needs a signing key and somewhere to
  publish a manifest.
- **Windows and Linux.** Same wrapper, and neither should need application code
  changes. WebKitGTK is the one with real risk and
  [ADR 0006](../../docs/adr/0006-desktop-packaging.md) says to benchmark it
  before committing.
