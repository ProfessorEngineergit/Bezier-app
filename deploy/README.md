# Bezier's servers

Bezier runs on your machine and needs no server. Two parts are servers, both optional, both yours to
host:

| | What it does | Where the code is | Port |
| --- | --- | --- | --- |
| **Community store** | Lessons, plugins and wiki articles people share, each reviewed before it is public, and the leaderboard of who shared what. One address answers for all four (`/lessons`, `/plugins`, `/docs`, `/leaderboard`) | [`packages/lessons/community`](../packages/lessons/community) | 8790 |
| **Sync** | Projects shared and edited live by several people, end to end encrypted: the server orders and stores what it cannot read | [`sync`](../apps/sync-server) | 8787 |

Neither has dependencies beyond Node 22; the store uses Node's own SQLite.

## Run both on one machine

Docker and Docker Compose; a home server, a NAS or a small VPS is enough.

```bash
cp deploy/.env.example deploy/.env      # fill it in: names, origins, an enrollment code
pnpm install && pnpm community:build    # bundles the store into dist-server/
docker compose -f deploy/compose.yaml up -d
```

They then listen on ports 8790 and 8787 of that machine, for a reverse proxy or tunnel you already
run. Without one, `--profile https` adds Caddy, which gets certificates for `STORE_DOMAIN` and
`SYNC_DOMAIN` from Let's Encrypt (ports 80 and 443 must reach the machine):

```bash
docker compose -f deploy/compose.yaml --profile https up -d
```

`STORE_ORIGINS` in `.env` matters: it says who may read the store from a browser engine. The desktop
app is `tauri://localhost` (macOS, Linux) and `http://tauri.localhost` (Windows); with it empty the
app cannot read anything.

## Then, in Bezier

- **Store:** Settings › Community › the address, e.g. `https://store.example.org`. A build can carry
  it from the start: `VITE_STORE_URL=https://store.example.org` when building.
- **Sync:** Settings › Collaboration › switch it on › Create an account, with the address and the
  enrollment code.

## Running them

```bash
# Accounts for sharing, and the review queue (lessons; plugins-cli.js and docs-cli.js likewise)
docker compose -f deploy/compose.yaml exec store node dist-server/cli.js account-add <name>
docker compose -f deploy/compose.yaml exec store node dist-server/cli.js pending
docker compose -f deploy/compose.yaml exec store node dist-server/cli.js approve <id>

# Every copy of every sync object checked and repaired; run nightly (cron or a timer)
docker compose -f deploy/compose.yaml --profile maintenance run --rm scrub

# Health
curl https://store.example.org/lessons/v1/health
curl https://sync.example.org/v1/health
```

Back up `BEZIER_DATA_DIR`. What each server protects against, and what it does not:
[`packages/lessons/community/README.md`](../packages/lessons/community/README.md) and
[`apps/sync-server/DESIGN.md`](../apps/sync-server/DESIGN.md). One server alone: `apps/sync-server/deploy/` has the sync server's own
setup, including systemd units.
