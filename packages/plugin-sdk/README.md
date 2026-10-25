# @bezier/plugin-sdk

Everything an author needs to write a Bezier plugin: the types of the `bezier` object, and
`bezier-plugin`, which makes a plugin, runs it in the editor again on every save, says what the
store's review will say and packs it.

```bash
pnpm sdk:build                                   # dist-sdk/bezier-plugin.js, Node alone runs it
node dist-sdk/bezier-plugin.js new ada.gear-maker panel
cd ada.gear-maker
node ../dist-sdk/bezier-plugin.js dev            # Bezier: Settings, Community, Writing a plugin, Load
node ../dist-sdk/bezier-plugin.js check
node ../dist-sdk/bezier-plugin.js pack           # ada.gear-maker-0.1.0.bezierplugin
```

| File | What |
| --- | --- |
| [`bezier.d.ts`](bezier.d.ts) | The API, typed, with the permission each call needs. `new` copies it beside main.js |
| [`src/templates.ts`](src/templates.ts) | `command`, `panel`, `exporter`: each a plugin that works and that review accepts (tested) |
| [`src/folder.ts`](src/folder.ts) | Checks a folder with the store's own review (`community/plugins/server/review.ts`) |
| [`src/dev-server.ts`](src/dev-server.ts) | Serves the folder to this computer and rings the editor on a save |
| [`src/cli.ts`](src/cli.ts) | The command line |

The guide for authors is [`docs/sdk/README.md`](../../docs/sdk/README.md). How plugins are kept
safe is [`community/plugins/README.md`](../lessons/community/plugins/README.md).

Tested: `src/sdk.test.ts` (every template passes review, refusals, the dev server) and
`e2e/connected/plugin-dev.spec.ts` (a plugin from the dev server runs in the real editor, and again after a
save). Plugins run in the browser; the desktop app does not run them yet (`tools/spikes/plugin-frame-csp`).
