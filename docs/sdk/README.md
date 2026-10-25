# Writing a Bezier plugin

A plugin is one readable JavaScript file and a manifest. It runs next to the user's model in a
sandbox it cannot leave, asks for what it needs by name, and gets nothing else. This is the guide;
[`api.md`](api.md) is every call, [`cookbook.md`](cookbook.md) is short recipes and
[`publishing.md`](publishing.md) is review, the store and versions.

## In five minutes

You need Node 22 and Bezier open in a browser (Chrome, Edge, Firefox or Safari). The desktop app
does not run plugins yet.

```bash
npx bezier-plugin new yourname.first-plugin     # or: panel, exporter
cd yourname.first-plugin
npx bezier-plugin dev
```

In Bezier: **Settings → Community → Writing a plugin**, keep the address it shows
(`http://127.0.0.1:5199`) and press **Load**. A plugin button appears at the right of the editor;
its menu has your command. Change the command's title in `main.js` and save: the menu changes,
with no reload and nothing installed.

> In this repository, before the package is published: `pnpm sdk:build`, then
> `node dist-sdk/bezier-plugin.js` in place of `npx bezier-plugin`.

## What you get

| | |
| --- | --- |
| `plugin.json` | The manifest: id, name, version, the permissions it asks for |
| `main.js` | Your code. It runs as the body of an async function, with `bezier` in scope |
| `bezier.d.ts` and `jsconfig.json` | Types: your editor completes every call and names the permission it needs |
| `README.md` | Shown in the store under the plugin |

## Concepts

**The sandbox.** `main.js` runs in a frame with no origin of its own. It cannot see the editor,
the user's other projects, other plugins, cookies or storage, and it cannot load code: the
frame admits one script, yours, by its hash. Everything it does is a message to Bezier, which
checks the permission first. The permission is not a promise in a manifest:
a call without it is refused. How that is enforced:
[`community/plugins/README.md`](../../packages/lessons/community/plugins/README.md).

**Permissions.** Ask for the least that works. The person sees each in plain words before
installing, and again when an update asks for more.

| Permission | Lets the plugin | Risk |
| --- | --- | --- |
| `project:read` | read the open model (`model.read`, `project.read`) | high |
| `project:create` | open a model it made as a new project; never change one | medium |
| `selection:read` | see what is selected | low |
| `ui:panel` | show its own panel | low |
| `ui:command` | add up to 20 commands | low |
| `files:export` | offer a file to save; the user confirms each | medium |
| `files:import` | read a file the user picks | medium |
| `storage` | keep 1 MB of its own settings | low |
| `network` | reach up to 4 https origins listed in `network` | high |

`project:read` together with `network` can send the model away. The install dialog says so in red,
and the store's *Works without internet* filter hides such plugins. Only ask for both when that is
the plugin's job.

**The model.** `bezier.model.read()` gives the model as data: each step of the history with its
type, name and state (`ok`, or why not), the variables, the bodies and the size. `project.read()`
gives the whole project file when you need the parameters themselves. Faces and edges are named by
**stable references** such as `F:extrude-1:side-2`: they survive a rebuild, so a plugin can store
one and find the same face tomorrow.

**Panels** are ordinary pages: draw into `document.body`. Bezier's colours and spacing are CSS
variables (`--text`, `--text-dim`, `--accent`, `--line`, `--pad`, `--font`, …), so a panel looks
like the app in the light and the dark theme.

## The loop

| Step | Command | What happens |
| --- | --- | --- |
| Make | `bezier-plugin new <id> [template]` | A folder with a plugin that works and that review accepts |
| Run | `bezier-plugin dev` | The editor runs it, and again on every save |
| Debug | the browser's developer tools | The plugin is a frame named after it; `console.log` and breakpoints work there |
| Check | `bezier-plugin check` | The store's own review, run locally: what it refuses and what a reviewer will look at |
| Pack | `bezier-plugin pack` | `<id>-<version>.bezierplugin`, ready to upload |

## What review refuses, and why

`eval`, `new Function`, dynamic `import()`, workers, WebAssembly, reaching other windows, cookies,
navigation, network calls without the permission, invisible characters, and any line over 1000
characters. A reviewer reads every line of every version, so minified code is not accepted: ship
the source. The full list and the reasons: [`publishing.md`](publishing.md).

## Where this is going

Planned, in this order, and not built yet: plugins in the desktop app; custom features that
regenerate in the history like Extrude does (the thing CAD developers ask for most, and the reason
the API reads the model by stable references); a headless runner to test a plugin against the real
geometry kernel in CI. The API is versioned (`api: 1`) and changes only by adding; see
[`publishing.md`](publishing.md#versions-and-what-stays-stable).
