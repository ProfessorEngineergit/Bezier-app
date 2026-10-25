# Community plugins

People add a **plugin server**, browse its plugins and install them, the way
Home Assistant's community store works. A plugin is code someone else wrote,
running next to the user's models, so every decision below starts from one
question: *what is the least a plugin needs, and how do we make sure it gets
no more?*

## What a plugin may do — decided

A plugin asks for permissions in its manifest. The person sees each one in
plain words before installing and again whenever an update asks for more. The
runtime refuses every call whose permission was not granted.

| Permission | In the user's words | Risk | Why it exists |
| --- | --- | --- | --- |
| `project:read` | Read the model you have open | high | analysis, export, checks: most useful plugins need it |
| `project:create` | Open models it makes as new projects | medium | generators (gears, enclosures). It **never changes** an existing project, so a plugin cannot damage work |
| `selection:read` | See what you have selected | low | "do this to the selected face" |
| `ui:panel` | Show a panel beside the model | low | the plugin's own interface, inside its sandbox |
| `ui:command` | Add commands | low | up to 20, listed under the plugin's name |
| `files:export` | Offer files to save, you confirm each one | medium | exporters. Bezier asks the user for every file, in Bezier's own interface |
| `files:import` | Read files you choose for it | medium | importers. The person picks every file; the plugin never sees a file system |
| `storage` | Keep up to 1 MB of its own settings | low | preferences. Its own space, deleted with it |
| `network` | Connect to *these hosts* | high | only with a list of up to 4 https origins, shown by name |

**Never possible, for any plugin:** the Bezier window itself (its page, its
DOM, its scripts), other plugins, the user's other projects, their lessons,
cookies, IndexedDB or localStorage of the app, camera, microphone, clipboard,
notifications, new windows, navigation, and any site not on its list.
`project:read` together with `network` is the one combination that can carry
work away. The consent dialog says so in red, and the store's *Works without
internet* filter hides every plugin that has network access.

## How that is enforced

```
 Bezier window (CSP: frame-src 'none')
 ├─ PluginRuntime (runtime/bridge.ts) ── checks every call against granted permissions (runtime/calls.ts)
 │    │ MessagePort, one per plugin, no other channel
 │    ▼
 └─ <iframe sandbox="allow-scripts" srcdoc>   no origin of its own
        CSP: default-src 'none'; script-src 'sha256-<SDK + main.js>'; connect-src <granted origins | 'none'>
        bezier.* (runtime/sdk.ts) → messages only
```

- **No origin.** `sandbox="allow-scripts"` without `allow-same-origin` gives the
  frame an opaque origin: the app's storage, cookies and IndexedDB do not exist
  for it, and the editor's page is a cross-origin window it cannot read.
- **Only the reviewed code runs.** The frame's policy admits one inline script
  by its SHA-256: the SDK followed by `main.js`. No `eval`, no `new Function`,
  no imported, fetched or blob scripts, no workers. Code that would end the
  script element early (`</script`, `<!--`) is refused before it runs.
- **Network only where granted.** `connect-src` lists the granted origins, or
  `'none'`.
- **One private line.** Each plugin gets its own `MessagePort`. The SDK accepts
  the port only from the window that created its frame, so another plugin
  cannot hand it a fake one; the runtime never listens to `window` messages.
- **Bounded.** 50 calls a second, sizes capped per call, 20 commands, 1 MB of
  storage, 100 MB per file.
- **Stopped when it misbehaves.** A plugin that stops answering pings for 10 s,
  or whose frame loads a second document (it navigated away from its
  policy), is stopped and switched off until the user turns it on again.
- **The host must send `frame-src 'none'`** (or a list without anything a
  plugin could use). That is what makes a navigating plugin frame load
  nothing at all. The development page does; the editor must too.

What this does **not** cover: a plugin can freeze its own frame, and on
browsers that run sandboxed frames in the page's process that can stall the
window until the watchdog removes it. A plugin with `project:read` + `network`
can send the model to the hosts it lists. That is what the user agreed to,
and why the dialog says it in red.

## Review before anyone can install it

Every version waits for a person. The server helps that person and refuses
what no plugin needs (`server/review.ts`):

- **Refused:** `eval`, the `Function` constructor, dynamic `import()`, workers,
  `importScripts`, WebAssembly, reaching `window.top`/`parent`/`opener`,
  cookies, navigation, `</script`; network calls without the `network`
  permission; **any line over 1000 characters** (minified code cannot be
  reviewed, so it is not accepted); names and descriptions with links or
  blocked words.
- **Flagged for the reviewer:** decoding text at run time, long escaped
  strings, very long literals, its own `postMessage`, and reading the model
  while using the network.
- These checks help the reviewer; they are not the boundary. The sandbox is.

`cli.ts review <versionId>` prints the manifest, permissions, findings, report
count and **the whole of `main.js`**, because approving code means reading it.

**Ids and versions.** A plugin id belongs to the author who first uploaded it;
nobody else can publish under it. Each new version must be higher than every
version uploaded before, so an old version cannot be replayed.

**Revocation.** `cli.ts revoke <versionId>` takes a version back. Installed
copies ask their server about themselves whenever the Installed list opens,
and a revoked version is switched off there and then (`client/updates.ts`).

**Updates** that ask for nothing new install with one click. One that asks
for more shows only the new permissions and waits for the user.

## The format: `.bezierplugin`

A stored (uncompressed) zip: `plugin.json`, `main.js`, optional `README.md`.
Validated by `format/manifest.ts` and `format/package.ts`.

```json
{
  "format": "bezier-plugin", "version": 1, "api": 1,
  "id": "ada.stl-export", "name": "STL export", "pluginVersion": "1.0.0",
  "description": "…",
  "permissions": ["project:read", "files:export", "ui:command"]
}
```

Inside the frame, `main.js` runs as an async function with `bezier` in scope:

```js
const text = await bezier.project.read();            // project:read
await bezier.project.create(projectText, 'Gear');      // project:create
await bezier.selection.read();                         // selection:read
await bezier.commands.add('Export STL', async () => {}); // ui:command
await bezier.panel.show('Title'); bezier.panel.hide(); // ui:panel; draw into document.body
await bezier.files.save('a.stl', 'model/stl', bytes);  // files:export → true if saved
await bezier.files.pick('.csv');                       // files:import → { name, type, bytes } | null
await bezier.storage.get('k'); bezier.storage.set('k', 'v'); // storage
await bezier.notify('Done.');                          // always allowed
```

Panels get Bezier's design tokens as CSS variables (`--text`, `--accent`, …).
Two working examples are in `dev/examples/`.

## API, version 1

| | |
| --- | --- |
| `GET /v1/info` | `{ name, description, kind: "plugins", uploads }` |
| `GET /v1/plugins?q=&offline=1&cursor=` | `{ plugins: PluginEntry[], next? }`: newest approved version of each |
| `GET /v1/plugins/:id` | `{ plugin: PluginEntry \| null, revoked: string[] }`, cached 60 s |
| `GET /v1/plugins/:id/versions/:version/package` | the package, approved versions only |
| `POST /v1/plugins` | upload (Bearer token) → `202 { id, version, status: "pending" }` |
| `GET /v1/mine` | the token's own versions and their status |
| `POST /v1/plugins/:id/report` | `{ reason }`; at 3 reporters the plugin leaves the catalogue until reviewed |

The client checks every field (`client/catalog.ts`), the download's size and
hash, and that the package's manifest names the same id and version. Consent
is asked for what the **package** declares, not what the catalogue said.

## Folders

| | |
| --- | --- |
| `format/` | manifest and package: shared by app and server |
| `runtime/` | `contract.ts` (`PluginHost`, what the editor implements), `bridge.ts` (runs plugins), `calls.ts` (permission table), `sandbox.ts` (the frame's document and policy), `sdk.ts` (`bezier.*`) |
| `client/` | server API, installed plugins (IndexedDB `bezier-plugins`), updates and revocation, publishing |
| `ui/` | `PluginsHome` (Browse / Installed), `PluginCard`, `ConsentDialog`, `InstalledList`, `PublishDialog` |
| `server/` | review, store, HTTP, operator CLI. It shares `http-kit`, rate limits and the text filter with the lessons server |
| `dev/` | a stand-in editor that runs installed plugins, the seeded server, the examples |

## Running it

```bash
pnpm community:build
export PLUGINS_DATA=/srv/plugins PLUGINS_NAME='Ada’s Bezier plugins' PLUGINS_ORIGINS='*'
node dist-server/plugins-main.js                    # 127.0.0.1:8789, behind TLS like the lessons server
node dist-server/plugins-cli.js author-add "Ada" 5
node dist-server/plugins-cli.js pending
node dist-server/plugins-cli.js review <versionId>
node dist-server/plugins-cli.js approve <versionId>
```

The hosting advice in [`../README.md`](../README.md) applies unchanged
(a tunnel or Caddy in front, its own user, backups).

**In the editor:** `apps/studio/src/plugins/PluginLayer.tsx` implements `PluginHost`, makes the
one `PluginRuntime` and starts the enabled installed plugins; the Community page is handed that
runtime, so installing and switching off take effect at once.

## Tested, and not

- **Not in the desktop app.** A `srcdoc` frame inherits the policy of the page that holds it,
  and the desktop app's policy (`script-src 'self'`) refuses the plugin's inline script
  (`tools/spikes/plugin-frame-csp`, 2026-10-08). In a browser, where the app sends no policy,
  plugins run. The desktop app needs the frame's document served from an origin of its own.

- `pnpm test`: manifest and package rules; the frame's policy (hash-only script,
  connections, no early `</script>`); the server end to end (tokens, every
  refusal above, review-then-serve, hash check, id ownership, version replay,
  the offline filter, revocation).
- `pnpm e2e` (Chromium, against the stand-in editor): add a server, filter,
  install with consent, run a command, see its panel; saving a file waits for
  the user; **hostile plugins planted directly on the device** cannot read
  storage, the parent page, the network or the model without permission; one
  that navigates is stopped and stays switched off. Photographs in
  `docs/screens/plugins-*`.
- **Not verified:** Safari/WebKit and Firefox (the sandbox is web-standard,
  but has not been run there); the watchdog against a plugin in an endless loop;
  `files:import` (written, no browser test); behaviour inside the real editor.
