# Bezier Sync: design

**Status: built and tested, and wired into Bezier** (Settings → Collaboration; the code is
in `apps/studio/src/collab/`). 64 Node tests here run against a real server on real files;
the app's side runs two devices on the real kernel against a real server
(`live-project.test.ts`), three devices on two kernels in `tools/spikes/live-collab.ts`, and two
people in two browsers in `e2e/connected/collaboration.spec.ts`. Nothing here changes local-first:
the local journal stays the source of truth on each device, and sharing is opt-in (ADR
0005, ADR 0015).

## The idea

Working together on one project, live, on a server that is yours and cannot read anything.
Several people open the same project and see each other's edits as they are made. Every
device builds the model itself with its own kernel; the server only puts everyone's
edits in one order, stores them and hands them out. A small server on a home Proxmox
box, a NAS or a cheap VPS is enough. Like Outline or Vaultwarden: community-hosted, no
service run by the project.

The server holds **only ciphertext**. It stores, replicates, verifies and serves blobs
and enforces who may read and write. It cannot read a model, a project or vault name, a
branch name, an edit or a member's display name. A compromised server, a curious
hosting company or a stolen disk leaks nothing about the work.

## The pieces

```
protocol/   shared by both sides: bytes, crypto.ts (vault keys, sealing),
            identity.ts (people, wrapping, invites, backups), wire.ts (the API)
server/     node:http, no dependencies: routes, auth, vaults, live (edit order),
            refs, store, presence, views, mirror
client/     connection, vault-client (vaults, sharing, rotation), live-state,
            live and live-sync (live projects), repository and workspace (the vault's
            project list), merge (by project), document-merge (by feature), presence,
            view-links
deploy/     Docker + Caddy, or systemd for a Proxmox LXC container
```

Zero runtime dependencies on either side. The server is meant to run for years on a box
nobody updates, and runs its TypeScript with Node's own type stripping, so there is no
build: the box runs exactly the source in this folder. Imports carry `.ts` for that
reason. That differs from the workspace's `.js` rule; folding the client into
`packages/` would switch it back.

## Live projects

The core of it, decided in [ADR 0015](../../docs/adr/0015-live-collaboration.md). A shared
project is an ordered list of **edits**; an edit is the journal operations one action
wrote (`Session.onCommit`), sealed with the vault key. A device sends each edit as it is
made; the server gives it the next number and answers every device that is waiting for
one (a long poll that holds for up to 25 seconds, so an edit arrives within a moment and
nothing else is needed through a proxy). Every device applies the edits in that order
(`client/live-state.ts`) and takes its open model to the result through the journal
(`Session.adopt`, with `diffOperations` from `@bezier/core`).

| Thing | What it is | What the server sees |
| --- | --- | --- |
| **Channel** | One project's edits | A keyed hash of the project id, like a branch id |
| **Edit** | `{ id, ops }` sealed; large ones (an imported file) as objects | A number, the member who sent it, the time, the size |
| **Checkpoint** | The whole document after edit *n*, as objects | Which edit it follows |

A device writes a checkpoint every hundred edits; single edits more than 500 behind it
are deleted. A device that has been away longer starts again from the checkpoint and
sends what it did meanwhile; an edit sent twice (a retry) is recorded once. A device
without a connection keeps working: its edits wait on the device and go when it is
back, and edits made with collaboration switched off are found by comparing the copy
with what it should show, and sent too.

The **vault's project list** (which projects are shared, their names, their branches)
stays the signed, Git-like structure below.

## The model: Git, encrypted

| Thing | What it is | What the server sees |
| --- | --- | --- |
| **Vault** | The unit of sharing: one keyring, one member list, any number of projects | A random id, member ids and roles, sealed metadata |
| **Object** | Immutable, content-addressed: a chunk of a project, a project manifest, or a commit | `sha256(ciphertext)` as id, and the ciphertext |
| **Commit** | Parents, a tree `{projectId → {name, document}}`, author, message, time, signature | Nothing but an object |
| **Branch head** | Name, commit, version, author, time, signature; moved by compare-and-swap | A keyed hash of the name, and a sealed value |

### Why the object id is a hash of the ciphertext

Objects are sealed with a **synthetic IV**: the nonce is an HMAC of the plaintext under
a vault key. The same content seals to the same bytes. Two things follow:

1. **Deduplication.** A model whose 4 MB chunks did not change between commits does not
   upload them again.
2. **The server can check integrity without the key.** It refuses an upload whose bytes
   do not hash to its id, checks every read, and `scrub` finds and repairs bit rot from
   a replica. Clients check again before decrypting, so a server swapping objects is
   caught too.

The cost: the server can see that two objects inside one vault are identical, which
deduplication shows anyway.

## Cryptography

All WebCrypto, nothing hand-written.

- **Identity**: an Ed25519 key (logins, commits, branch heads) and an X25519 key
  (receiving vault keys), made on the device. The user id is a hash of the signing key.
- **Login**: sign a server nonce. No passwords exist, so a leaked server has none to
  crack, and nothing it stores lets anyone log in.
- **Keyring**: one 32-byte root per epoch; HKDF derives the encryption, nonce and name
  keys. Everything sealed carries its epoch in a header that is also authenticated. The
  keyring is wrapped for each member (ephemeral X25519, HKDF, AES-256-GCM, bound to the
  recipient's id).
- **Sharing**: wrap the keyring to the member's public key; the server only relays it.
- **Invite links**: `https://server/#join=<vault>.<secret>`, pasted into Bezier. The
  fragment is never sent to the server; the address before it says which server. The
  server holds the keyring sealed under a key derived from the secret, plus a hash of a
  token derived from it: enough to check a claim, not enough to open the keyring. Links
  expire (30 days at most), have a use count, and can be withdrawn.
- **Signatures**: every commit and every branch head is signed and checked on read. Any
  member holds the key, so without them one member could write in another's name. A bad
  signature is shown, not hidden.
- **Identity backup**: the identity sealed under a passphrase (PBKDF2-SHA256, 600 000
  iterations, AES-GCM), downloaded as a file. Offered straight after an account is made.

### Revocation

Removing a member **rotates the key**: the admin's client makes a new epoch and wraps the
grown keyring for exactly the remaining members; the server refuses a rotation that
does not cover exactly the current member list, or that started from an old epoch.
Pending invites, which hold the old keyring, are withdrawn. From then on everything new
is sealed with a key the removed person never had, even if they get a copy of the
server's disk. What they already downloaded, they keep; no system can take that back.

A share or invite prepared against an old epoch is refused, so a slow client cannot hand
someone an outdated keyring by accident.

### Rollback

The server cannot forge a branch head, but it could serve a genuine older one, quietly
undoing someone's work. Each head carries a version that goes up with every move, and
each device remembers the highest version it has seen of each branch. A lower one is
flagged, and a warning is shown over the branch. (Two devices that have never
seen the newer head cannot notice; comparing notes between members would close that.)

### What the server learns

How many vaults, members and objects there are, their sizes, when they change, which
public keys belong to which vault, roles, which branches are protected (by id), and
which objects are equal. Not: names of anything, contents, messages, authorship of a
commit, or the tree structure.

### What it does not protect against

- **A malicious member** can push garbage or delete unprotected branches. Roles limit
  who can write; history makes it recoverable; protected branches limit the damage.
- **Metadata**: sizes and timing, as above.
- **The device itself.** The identity in IndexedDB is the user; script running in the
  app could use it. Every string from another member is shown as text, never as markup,
  and an edit from another member goes through the same `apply` and rebuild checks as a
  project file from disk.
- **Where Bezier itself comes from.** The server serves no app, so it cannot hand anyone
  code that reads their keys. Bezier comes from the desktop app or from wherever it is
  served, and that is who is trusted with the keys.

## Redundancy

A project exists in at least three places once pushed:

1. **Every device that has it** keeps the whole project in its library, and the sealed
   objects it read in IndexedDB.
2. **The server's primary directory.**
3. **Every replica directory** (`BEZIER_SYNC_REPLICAS`: a second disk, a ZFS dataset, an
   NFS or SMB mount, an rclone mount to object storage). Writes go to all; a failing
   replica is marked and logged instead of failing the request; `scrub` (nightly timer)
   copies what it missed and repairs any copy whose hash is wrong.

Everything stored is already encrypted, so off-site backup is safe anywhere.

## Merging

Live edits need none: everyone applies everyone's in one order. Merging is for
**branches** (`apps/studio/src/collab/branches.ts`): a branch is a project of its own,
live too, that remembers where it started. Merging it back takes what it changed since
then into the project as one live edit. Two levels, both pure functions with their own
tests:

1. **By project** (`client/merge.ts`): a project changed on one side is taken from that
   side; a rename and an edit on different sides both survive; deleting a project
   someone else edited is a conflict, never a silent loss.
2. **By feature** (`client/document-merge.ts`), for a project both sides changed: a
   Bezier project is `{ meta, features: [{ id, … }] }`, and features are matched by id
   (ids are minted per edit, `sketch-<timestamp>`, so independent additions do not
   collide). Features added on either side are kept in place, a feature edited on one
   side is taken from that side, a feature changed on both sides merges field by field
   (one renamed it, the other resized it: both stay), a reorder on one side is kept,
   `meta` merges per key
   with the later `modifiedAt`. References between features are stable references
   (`F:extrude-1:side-2`), which is what lets a feature one person added sit on a face
   the other person's edit kept; if that face is gone, the rebuild marks the feature
   broken, as after a local edit.

What still conflicts (the same field of a feature changed differently on both sides) is
resolved in the branch's favour when a branch is merged back, since merging it is
asking for it; the merge says how many such places there were, and the project's
history and undo can take any of it back.

When a change to the project list races someone else's, the workspace merges and pushes
again by itself (`client/workspace.ts`), so nobody meets a compare-and-swap.

## In Bezier

Settings → Collaboration: a switch, then connecting to a server (an account with the
enrollment code, an invite link, or a backup), the name others see and this machine's
name, and the server's setup files to download. With it on:

- A project's menu on the start page offers **Share…**; shared projects carry "Shared"
  on their card and turn up among everyone's projects by themselves.
- In an open shared project, the top of the canvas shows **who else is in it** and on
  which machine, and whether edits are going out. A click there shows the **recent
  changes**, with going back to before one, starting a branch from before one, and, on a
  branch, merging it back or discarding it.
- The start page sidebar lists the vaults and opens an invite or read-only link.

## Not done yet

| What | Why it is not here |
| --- | --- |
| **Comparing branch versions between members** | Would let a member notice a rollback their own device never saw the newer side of. |
| **Live edits on the mirror** | A mirror copies objects and branch heads; live channels are not mirrored yet, so a mirror has each project as of its last checkpoint. |
| **Seeing others' cursors and selections** | Presence says who is in a project and on which machine, not where they are looking. |
| **A Docker build** | Written, and the image's file set was run here; `docker build` itself was not available in this environment. |
