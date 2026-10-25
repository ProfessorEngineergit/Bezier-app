# Bezier Sync

A server you host yourself, on a Proxmox box at home, a NAS or a small VPS, that lets
several people work on the same Bezier project at the same time, and keeps
it safe and redundant. Everything is **end-to-end encrypted**: the server puts everyone's
edits in order, stores and replicates them, and cannot read any of it. Bezier itself is
the app: switch it on in Settings, under Collaboration.

Design, threat model and what is not done yet: [`DESIGN.md`](DESIGN.md). Why live
editing works this way: [ADR 0015](../../docs/adr/0015-live-collaboration.md).

## What you can do

- **Share a project** from its menu on the start page. Everyone it is shared with finds it
  among their projects and opens it like any other.
- **Work on it together, live.** Each edit reaches everyone who has it open within a
  moment; the top of the canvas shows who else is in it and on which machine. Two people
  changing the same thing at once end with the later change.
- **Without a connection**, edits wait on the device and go when it is back.
- **Don't like a change?** The list of recent changes offers going back to before it (an
  edit like any other, so it can be undone) or starting a **branch** from before it. A
  branch is a project of its own, live too; merge it back feature by feature, or discard
  it.
- **Vaults** hold shared projects and their people: invite by link, or add someone by
  their id. Roles: can view, can edit, admin. **Read-only links** let someone look, live,
  without an account.
- **Removing someone changes the vault key**, so what is written afterwards is sealed
  with a key they never had.
- **Backups of your identity**, protected by a passphrase, to restore on another device.
  No passwords: your identity is a key pair made on your device.
- **Mirroring** to a second server, and nightly scrubbing of every stored copy.

## Run it

Node 22.18 or later. No `npm install`: there are no dependencies, and no build step.

```bash
cd sync
BEZIER_SYNC_ENROLLMENT='a-long-random-code-for-accounts' node server/main.ts serve
```

Then in Bezier: Settings → Collaboration → switch it on → Create an account, with
`http://localhost:8787` and the code. Anywhere but this machine, Bezier only talks to a
server over **HTTPS** (below).

| Variable | Meaning | Default |
| --- | --- | --- |
| `BEZIER_SYNC_DATA` | Primary storage directory | `./data` |
| `BEZIER_SYNC_REPLICAS` | More directories, `:`-separated; every write goes to all | none |
| `BEZIER_SYNC_HOST` / `BEZIER_SYNC_PORT` | Where to listen | `127.0.0.1` / `8787` |
| `BEZIER_SYNC_ENROLLMENT` | Code that lets someone create an account without an invite (16+ chars) | invites only |
| `BEZIER_SYNC_QUOTA_MB` | Space one vault may use | unlimited |
| `BEZIER_SYNC_TRUST_PROXY` | `1` behind a proxy that sets `X-Forwarded-For` (the Caddy setup) | off |
| `BEZIER_SYNC_ORIGINS` | Origins Bezier may call from, `,`-separated; every call needs a token anyway | any |

`node server/main.ts scrub` checks every copy of every object and repairs damaged or
missing ones from a good copy. Run it nightly; both deploy options below do.

## Install

### Proxmox, in an LXC container (recommended at home)

1. Create a Debian 12 container. 1 core, 512 MB RAM and a few GB of disk are plenty; it
   only stores files. Optionally add a second mount point on another disk as a replica.
2. Install Node 22, copy this folder to `/opt/bezier-sync`, and use the systemd units in
   [`deploy/`](deploy): `bezier-sync.service`, plus `bezier-sync.timer` for the nightly
   scrub. Settings go in `/etc/bezier-sync.env`.
3. Reach it over HTTPS, one of:
   - **Tailscale** in the container and `tailscale serve 8787`: no open port, a
     certificate included. The simplest safe option for a few people.
   - **A reverse proxy you already run** (Caddy, Traefik, Nginx Proxy Manager).

### Docker, at home or on a VPS (Ionos, Hetzner, …)

```bash
cp deploy/.env.example deploy/.env      # set the domain and the enrollment code
docker compose -f deploy/compose.yaml up -d
```

Caddy in front gets a Let's Encrypt certificate; only ports 80 and 443 are open. In
Bezier, create your account with `https://your-domain` and the enrollment code, then
consider emptying `BEZIER_SYNC_ENROLLMENT` and inviting everyone else by link.

Even on a VPS you do not fully trust, the provider sees ciphertext only. HTTPS still
matters: it hides session tokens and the shape of the traffic.

## Back it up

Everything in the data directory is already encrypted, so it can go anywhere: `restic`,
`rsync` to a friend's NAS, object storage. Objects never change once written, which
makes incremental backup cheap. Keep your **identity backup** (Account → Download backup)
somewhere other than your computer: without a member's key nobody can open a vault, not
even the server's owner.

## Tests

```bash
node --test "**/*.test.ts"     # protocol, server, client, live edits (Node)
```

The Node tests run a real server on real files. The app's side is tested from the
repository root: `apps/studio/src/collab/live-project.test.ts` (two devices editing one
model live on the real kernel, offline edits, a reader, branches),
`tools/spikes/live-collab.ts` (three devices, two kernels, edits crossing in any order) and
`e2e/connected/collaboration.spec.ts` (two people in two browsers).

## Layout

| Path | |
| --- | --- |
| [`protocol/`](protocol) | Bytes, encryption, identities, the wire types. Shared by server and app |
| [`server/`](server) | Routes, login, vaults and roles, live edit order, branch heads, storage with replicas and scrub, mirroring |
| [`client/`](client) | Connection, vaults and sharing, live edits (`live*.ts`), the vault's project list, the feature merge branches use |
| [`deploy/`](deploy) | Dockerfile, Compose and Caddy; systemd units for an LXC container |
