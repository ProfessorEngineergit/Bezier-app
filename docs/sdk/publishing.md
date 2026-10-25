# Publishing, review and versions

## The store

People add a plugin store in **Settings → Community** and install from it, the way Home
Assistant's community store works. Anyone can run one: [`docs/servers.md`](../servers.md). Every
version waits for a person to read it before anyone can install it.

1. `bezier-plugin check` until nothing is refused.
2. `bezier-plugin pack`.
3. Upload the `.bezierplugin` with the token the store's operator gave you (Bezier: Community,
   Publish; or `POST /v1/plugins`).
4. A reviewer reads all of `main.js` and approves or refuses it with a reason (`GET /v1/mine`).

## What review refuses

| Refused | Why |
| --- | --- |
| `eval`, `new Function`, dynamic `import()`, workers, `importScripts`, WebAssembly | The code that runs must be the code that was read |
| `window.top`, `parent`, `opener`, cookies, navigation | Nothing outside the frame is the plugin's |
| `fetch`, `WebSocket`, `XMLHttpRequest` without `network` | Connections must be asked for |
| Lines over 1000 characters | Minified code cannot be reviewed |
| Invisible characters (zero-width, direction marks, tag characters) | Malware hid in them in 2025 (GlassWorm); a reviewer would read an empty line |
| `</script` or `<!--` in the code | It could end the sandboxed script early |
| Links or blocked words in the name or description | The store is not an advertising space |

**Flagged for the reviewer**, not refused: decoding text at run time, long escaped strings, very
long literals, its own `postMessage`, and reading the model while using the network.

## Ids, versions, updates

- The id belongs to whoever uploaded it first; nobody else can publish under it.
- Each version must be higher than every one before, so an old version cannot be replayed.
- An update that asks for nothing new installs with one click. One that asks for more shows only
  the new permissions and waits for the user.
- A store can revoke a version; installed copies switch it off the next time the list is opened.

## Versions and what stays stable

- `api` in the manifest is the plugin API the plugin was written for. Version 1 only grows: calls
  are added, none are removed or change what they return. A plugin written for 1 keeps working.
- A call that has to change gets a new name, and the old one keeps working for at least a year
  after the new one ships, with a notice in the release notes.
- When the API needs something that cannot be added, it becomes `api: 2`, and Bezier runs version
  1 plugins as before.
- Nothing is published as "preview" to stay that way: a call is either in the API or not in it.
