# Scripts

| Script | What it does |
| --- | --- |
| `check-structure.ts` | The layout rules of [`docs/contributing/conventions.md`](../docs/contributing/conventions.md), enforced (`pnpm check:structure`) |
| `check-doc-links.ts` | Every relative link and image in the documents resolves, and a public document does not link into a path the public repositories leave out (`pnpm check:links`) |
| `project-facts.mjs` | Counts the project (lines, tests, ADRs, features) so the numbers can be recounted |
| `load-budget.mjs`, `speed-suite.mjs`, `frame-budget.mjs` | The measurements behind [`docs/benchmarks.md`](../docs/benchmarks.md) |
| `drive-desktop-app.mjs` | Drives the built desktop app (a new project, a box, a reload, a restart) through `tauri-driver`; run by the desktop smoke workflow on Linux |
| `linux-build/` | The Linux packages built in Docker (`build.sh`), and the Fedora `.rpm` packed natively from the `.deb` (`rpm-from-deb.sh`) |
| `platform-check/` | The installed app checked on a clean Fedora 41 (`run-fedora.sh`): the film plays, the machine is recognised, how fast tools open, frames at rest (`check.mjs`, also usable by hand on Windows) |
| `capture/` | The screenshots: `mac-window.sh`, `windows-window.ps1`, `screen.ps1`, `optimise.mjs` ([`docs/assets/README.md`](../docs/assets/README.md)) |
| `dmg-background/` | The picture behind the installer window of the macOS .dmg: `render-nib.py` renders Nib in Blender (`art/nib.png`), `build.mjs` lays him on the brand ground and writes `apps/desktop/src-tauri/dmg/background.png`, and refuses to run if the icon positions in `tauri.conf.json` disagree with the drawing |
| `release.mjs` | Builds installers (`pnpm release`) |
| `invite.mjs` | Makes, lists and withdraws invitation codes for the alpha channel (`pnpm invite`) |
