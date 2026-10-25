# Community lessons

People add a **source**, a server that holds lessons, and then browse and
download from it inside Lessons, the way Home Assistant's community stores
work. Nothing is listed until somebody adds a source; this app ships none.

```
 Lessons app ──https──▶ reverse proxy (TLS) ──▶ community/server ──▶ data/lessons.db
 community/ui + client                                                data/packages/<sha256>.bezierlesson
```

Everything lives in this folder; nothing in it touches the lesson format or
the editor:

| Folder | Job |
| --- | --- |
| `client/` | sources (`sources.ts`), browse and download (`client.ts`), uploads and their status (`publish.ts`), server info and reports (`server-info.ts`), the library on this device (`library.ts`), checks on everything a server sends (`catalog.ts`), limits shared with the server (`limits.ts`) |
| `ui/` | the Community page as React components: `CommunityLessons` (the community's lesson cards on Learn, download → open, behind Learn's switch), `SourcesDialog` (add, switch off, remove servers), `UploadDialog` (send for review, see what became of earlier uploads) |
| `server/` | upload, review, serve. Node 22, no dependencies beyond `fflate`; SQLite through `node:sqlite` |
| `server/cli.ts` | the operator's tools: accounts, review, approve, reject, remove. Run on the machine, never over the network |
| `dev/` | the page on its own (`pnpm dev`, then `/community/dev/index.html`) and a seeded development server (`node dist-server/dev.js`, port 8788, token `dev-token-for-local-testing-only`) |

## Where it is in the app

The app knows **one store**: one address that answers for lessons under `/lessons` and for plugins
under `/plugins` (`server/front.ts`, started by `server/store-main.ts`), behind one switch
(`client/store.ts`). It is off until the user turns it on, and its address is Bezier's own
unless another is typed in Settings, Community. The page itself never mentions a server.

`ui/Community.tsx` is the Community page of the start page (`apps/studio/src/Dashboard.tsx`),
with lessons and plugins behind one switch. It is drawn with the Learn page's own head, switch,
cards and empty state, and takes the start page's search as `query`.

A download is an ordinary `.bezierlesson` package: it goes through `readPackage` and lands in the
app's lesson store (`src/store`, through `client/library.ts`) under a fresh id, so it appears on
the Learn page like an import. Which community lesson it came from is remembered beside it
(`client/downloads.ts`), not in the manifest, whose meaning must not change.

## API, version 1

Reading is public, uploading needs `Authorization: Bearer <token>`.

| | | |
| --- | --- | --- |
| `GET /v1/lessons?q=&level=&cursor=` | `{ lessons: CatalogEntry[], next? }` | approved lessons, newest first, 24 a page, cached 30 s with ETag |
| `GET /v1/lessons/:id` | `CatalogEntry` | |
| `GET /v1/lessons/:id/package` | the package | cached an hour, ETag is its SHA-256 |
| `POST /v1/lessons` | `202 { id, status: "pending" }` | body is the package. Errors are `{ error }` in a sentence for the uploader |
| `GET /v1/mine` | `{ lessons: { id, title, status, note }[] }` | the token's own uploads and why one was refused |
| `POST /v1/lessons/:id/report` | `202` | `{ reason }`; answers the same whether or not the lesson exists |
| `GET /v1/health` | `{ ok: true }` | |

`CatalogEntry` is in `client/catalog.ts`. `GET /v1/info` answers
`{ name, description, uploads, limits }`; the app reads it when a server is
added, so a mistyped address is refused instead of kept.

## How uploads are kept safe

The honest part first: **no code here can tell whether a video is disturbing.**
What stops it is that nothing is public until a person has watched it. The rest
makes that person's job small and keeps the server standing.

1. **Only the operator creates accounts** (`account-add`). A token is shown
   once and stored as a hash. Each has a daily upload limit (5 by default) and
   can be revoked. There is no sign-up form to abuse.
2. **Everything starts `pending`.** Only `approved` lessons are listed or
   served. `review <id>` prints where the package is, so it can be watched before
   `approve`. `reject` and `remove` delete the package from disk.
3. **Size and length limits** (`client/limits.ts`): 256 MB, 30 minutes,
   200 checkpoints, 200 000 events, 2 MB of model per checkpoint, 120 characters
   of title. The declared `Content-Length` is checked first, and the bytes are
   counted as they arrive, so an oversized upload is cut off, not buffered.
4. **The package is rebuilt, not stored as sent.** Entries must be stored, not
   compressed (so a zip cannot claim kilobytes and expand to gigabytes); unknown
   files are dropped; the recording's first bytes must match the video type it
   claims; every checkpoint must be a JSON object. What is served is the rebuild.
5. **Text filter** (`server/text-filter.ts`) on title, description, chapter and edit
   names: no links or addresses, no hidden or bidi-control characters, and a
   blocklist you keep in `data/blocklist.txt` (one word or phrase a line, `#`
   for comments). It matches whole words after undoing accents and `1`→`i`
   style disguises. It catches lazy cases. It is not moderation.
6. **Content hash ban.** The SHA-256 of the recording is kept for every lesson
   ever uploaded; a video you rejected or removed cannot return under a new
   title.
7. **Optional scanner.** `LESSONS_SCREEN_CMD=/path/to/script` is run with the
   package path on each upload; a non-zero exit rejects it. Put ffmpeg frame
   sampling plus an image classifier, or ClamAV, behind it if you want a machine
   opinion before you look. It is a pre-filter, never a replacement for step 2.
8. **Reports.** One report per address and lesson; at `LESSONS_REPORT_THRESHOLD`
   (3) distinct reporters an approved lesson drops back to `pending` until you
   look at it again.
9. **Rate limits** per address: 10 uploads an hour, 20 reports an hour, 600
   reads a minute. At most two packages are inspected at once (they are held in
   memory), and a third gets `503` with `Retry-After`.
10. **A small surface.** No admin API, no accounts API, ids are random 128-bit
    values checked against `^[0-9a-f]{32}$` before they touch a path, files are
    named by hash, responses carry `nosniff`, a `default-src 'none'` policy and
    no referrer, CORS allows only `LESSONS_ORIGINS`, and the server listens on
    `127.0.0.1` unless told otherwise.

What the **client** does with a server it does not control (`client/`):
https only (plain http for localhost), `credentials: 'omit'`, every field of
the catalogue validated, the download cut off at the size the catalogue
promised, the SHA-256 compared, then the normal package reader with its own
limits. A malicious source can show wrong titles within those limits; it cannot
make the app fetch another host, read a bigger file than it said, or hand over a
package whose bytes differ from its hash.

## What this does not protect against

- A model in a checkpoint (`states[].project`) is only checked to be a JSON
  object of bounded size. The editor validates it when it opens it
  (`reference/current/core/project-file.ts`); a hostile project is the editor's
  problem to refuse.
- Text *inside the video* (a title card, spoken words). Only a person or the
  scanner hook sees that.
- A determined uploader with a valid token. Hence per-account limits, review,
  and `account-revoke`.
- Your machine. A server in your home network is as safe as the machine and the
  tunnel in front of it; see below.

## Running it at home

```bash
pnpm install && pnpm community:build      # from the repository root; writes dist-server/, which runs with Node alone
export LESSONS_DATA=/srv/lessons          # database, packages, blocklist.txt
export LESSONS_NAME='Ada’s CAD lessons'   # what people see when they add it
export LESSONS_TRUST_PROXY=1              # only when a proxy is in front
export LESSONS_ORIGINS='*'                # public reads from any page; or list your app's origin
export LESSONS_PORT=8790                  # the default, 8787, is also Bezier Sync's
node dist-server/main.js

node dist-server/cli.js account-add "Ada" 5
node dist-server/cli.js pending
node dist-server/cli.js approve <id>
```

Put TLS and the open port in front of it with something that is not this
program, and expose nothing else:

- **Cloudflare Tunnel** or **Tailscale Funnel**: no port forwarded on the router,
  your home address stays hidden, and the tunnel absorbs most junk traffic. The
  easiest safe choice at home.
- **Caddy** with port forwarding: `lessons.example.org { reverse_proxy 127.0.0.1:8787 }`
  (automatic certificates). Set `LESSONS_TRUST_PROXY=1` so rate limits see the
  visitor, not Caddy.

Run it as its own unprivileged user (systemd `DynamicUser=yes`,
`ProtectSystem=strict`, `ReadWritePaths=/srv/lessons`, `NoNewPrivileges=yes`),
keep `/srv/lessons` on a disk with room (limit × lessons: 256 MB each at most),
and back up `lessons.db` and `packages/`.

**Speed:** lists and packages carry ETags and `Cache-Control`, so a CDN (or
Cloudflare in front of the tunnel) serves repeat downloads without touching your
line; the files are named by hash and are streamed from disk, not read into
memory. Search is a `LIKE` over title and description, fine into the tens of
thousands of lessons; beyond that, move it to SQLite FTS5.

## Tested, and not

- `pnpm test`: format and catalogue checks, the text filter, package
  inspection (zip bombs, fake videos, overlong lessons, blocked words, links),
  the store, and the HTTP server end to end with the real sample package:
  upload, hidden while pending, approve, list, search, download, hash and size
  mismatch caught, reports taking a lesson down, CORS.
- `pnpm e2e` (Playwright, against `dev/serve.ts`): no server → add one; browse,
  search, filter by level, download into IndexedDB, remembered after reload;
  report; switch a server off; upload with a wrong token, then the right one,
  and see it waiting for review; the page at 760 px. Photographs in
  `docs/screens/community-*`, light and dark.
- **Not verified:** behaviour behind a real reverse proxy or tunnel, the
  `LESSONS_SCREEN_CMD` hook (written, no test), a 256 MB upload on a slow line,
  and Safari/WebKit. Run through these before opening the server to the
  internet.
