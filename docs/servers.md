# The servers

Bezier works without any server. Three optional ones exist, each run by whoever wants it, on
a machine of their own. None of them is needed to model, and none is run by Bezier for anyone.

| Server | What it is for | Code | Default address |
| --- | --- | --- | --- |
| **Sync** | Shared projects: several people on one model, live, end-to-end encrypted | [`apps/sync-server/`](../apps/sync-server/README.md) | `127.0.0.1:8787` |
| **Community lessons** | Lessons other people share, each one approved by a person first | [`packages/lessons/community/server`](../packages/lessons/community/README.md) | `127.0.0.1:8787` |
| **Community plugins** | Plugins other people write, each version read by a person first | [`packages/lessons/community/plugins/server`](../packages/lessons/community/plugins/README.md) | `127.0.0.1:8789` |

Sync and community lessons share a default port. On one machine give the lessons server another
(`LESSONS_PORT=8790`).

## Sync

Node 22.18 or later, no dependencies, no build step.

```bash
cd sync
BEZIER_SYNC_ENROLLMENT='a-long-random-code-for-accounts' node server/main.ts serve
```

What it does:

- Accounts as key pairs made on the device; no passwords. An enrollment code or an invite link
  lets someone in.
- Vaults with people and roles (can view, can edit, admin), invites, read-only links.
- Stores sealed objects it cannot read, puts everyone's edits in order, and passes them on live.
- Presence: who has a project open, and on which machine.
- Branch heads signed and versioned; a removed member is locked out by a new vault key.
- Replica directories, mirroring to a second server, and `node server/main.ts scrub` to check and
  repair every stored copy.
- Per-vault quota and a rate limit on the login routes.
- Serves its own small web app from the same origin.

Tests: `cd sync && pnpm test` (Node's test runner, against a real server on disk).
Deployment: [`apps/sync-server/deploy`](../apps/sync-server/deploy) has a Dockerfile, a Compose file with Caddy for
HTTPS, and systemd units. Anywhere but on the same machine, Bezier only talks to it over HTTPS.

In the app: Settings, Collaboration.

## Community lessons and community plugins

One build makes both. Node 22 or later; SQLite through `node:sqlite`.

```bash
pnpm install
pnpm community:build
```

That writes `dist-server/`, which runs with Node alone and can be copied to the server.

**One address for both** is what the app expects: lessons under `/lessons`, plugins under
`/plugins`. People turn Community on with one switch and, for a store that is not Bezier's own,
type that one address in Settings, Community.

```bash
LESSONS_DATA=/srv/lessons PLUGINS_DATA=/srv/plugins LESSONS_ORIGINS='*' PLUGINS_ORIGINS='*' STORE_PORT=8790 node dist-server/store.js
```

Each half can still be run by itself:

```bash
LESSONS_DATA=/srv/lessons LESSONS_PORT=8790 LESSONS_ORIGINS='*' node dist-server/main.js
```

```bash
PLUGINS_DATA=/srv/plugins PLUGINS_ORIGINS='*' node dist-server/plugins-main.js
```

What the lessons server does:

- `GET /v1/lessons`, `/v1/lessons/:id`, `/v1/lessons/:id/package`: approved lessons only, with
  search, a level filter, paging, ETags.
- `POST /v1/lessons`: an upload from an account the operator made, held as pending.
- `GET /v1/mine`: the uploader's own uploads and why one was refused.
- `POST /v1/lessons/:id/report`: a report; enough of them send a lesson back to review.
- `GET /v1/info`, `/v1/health`.
- Every package is taken apart, checked and rebuilt from the parts that passed.
- The operator's tool, run on the machine and never over the network:
  `node dist-server/cli.js account-add "Ada" 5`, `pending`, `review <id>`, `approve <id>`,
  `reject`, `remove`.

The plugin server is the same shape for plugins, with `node dist-server/plugins-cli.js
author-add`, `pending`, `review <versionId>`, `approve <versionId>`, and it can revoke a version,
which installed copies then switch off.

A seeded store for trying the app against, with two lessons and two plugins:

```bash
STORE_PORT=8790 LESSONS_PORT=8788 PLUGINS_PORT=8789 node dist-server/dev-all.js
```

Then in the app: Settings, Community, store address `http://127.0.0.1:8790`.

Tests: `pnpm exec vitest run packages/lessons/community` (the servers run against a real
database on disk), and `pnpm exec playwright test e2e/library/community.spec.ts` for the app against the
seeded store.

## What is not done

- Plugins run in the browser version of Bezier and not yet in the desktop app
  ([`tools/spikes/plugin-frame-csp`](../tools/spikes/plugin-frame-csp/README.md)).
- Recognition (points, badges) counts on the device; stars, leaderboards and rewards are planned
  and have no server part yet.
- None of the three has been run on a public address by this project. The guides say how; the
  measurements are of local runs.
