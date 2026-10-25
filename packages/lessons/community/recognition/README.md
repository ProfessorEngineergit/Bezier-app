# Recognition: stars, badges, leaderboards, rewards

A plan for lessons and plugins alike. The aim: people who teach and build for
Bezier **get something real back** (visibility, standing, beautiful badges,
objects they can hold), and learners get a trustworthy signal of what is good.
Like GitHub: open source, free, no money involved, ever.

**Decided by the owner:** badges and points are **awarded automatically**;
there is **no money** in it; counting is **on by default** and introduced the
first time (`app/RecognitionIntro.tsx`); badges are **colour, gold and glass**,
ray traced.

**Built so far:** the points table and levels (`app/points.ts`), the counting
setting (`app/counting.ts`), the intro shown on the first visit to Community
or Plugins, and the ray-traced badges (`blender/badges.py` → `renders/`).
Everything else here is the roadmap.

## Principles

1. **Reward what helps people, not what is easy to count.** A lesson someone
   *finished* or *stepped into* counts more than one that was downloaded. A
   plugin people *keep installed* counts more than one that was tried once.
2. **Hard to game, or not worth gaming.** Every signal is one per person,
   time-weighted, and checked for patterns before it moves a badge or a rank.
3. **Private by default.** Counting needs no tracking: anonymous counters for
   use, accounts only for those who want to star, publish or show a profile.
4. **The interface stays quiet; the badges do not.** Bezier's chrome is
   monochrome glass. The badges are where colour lives: coloured glass, gold,
   real refraction. A badge is a made object, not a sticker.
5. **Per server, portable by proof.** Each community server awards its own
   badges, signed, so a person can show them anywhere and anyone can check them.

## What is counted

| Signal | Lessons | Plugins | How | Weight |
| --- | --- | --- | --- | --- |
| **Star** | ★ | ★ | one per account per item, can be taken back | high |
| **Finished** | lesson marked complete | — | opt-in ping on completion, one per device per lesson | high |
| **Stepped in** | *Open model here* used | — | anonymous ping, one per device per lesson per day | high |
| **Active installs** | — | still installed after 7 days | the update check that already exists (`GET /v1/plugins/:id`), counted per device per week | high |
| **Downloads** | ★ | ★ | already served; one per device per day | low |
| **Reports upheld** | ✗ | ✗ | a reviewer agreed with reports | negative |

"Per device" means a random id the app makes once and keeps locally. It is
never tied to a name, only hashed with a salt that changes daily on the server,
and only ever stored as daily counts. Counting is **on by default**. The first
visit to Community or Plugins shows the intro (*Your contributions count*):
what earns points, the levels, and the one switch, *Count my contributions*.

## Points and levels

Every counted contribution is worth points (`app/points.ts`), capped per item
per day, so no burst of anything buys a level:

| Contribution | Points | Daily cap |
| --- | ---: | ---: |
| Publish a lesson / a plugin | 50 | 3 / 1 |
| Ship a plugin update | 10 | 1 |
| Someone finishes your lesson | 5 | 100 |
| Someone opens the model in your lesson | 2 | 100 |
| Someone stars your work | 10 | 50 |
| Someone keeps your plugin for a week | 1 | 500 |
| Finish a lesson | 10 | 10 |
| Step into a lesson and keep the model | 3 | 10 |
| Learn something every week | 20 | 1 |
| Report a problem that gets fixed | 15 | 3 |

Levels are named after how a part comes together: **Sketch** (0) → **Extrude**
(100) → **Fillet** (300) → **Loft** (1 000) → **Sweep** (3 000) → **Assembly**
(10 000) → **Kernel** (30 000). Points are awarded by the server from the
counters, never by hand; a level is never lost.

### Against gaming

- Stars only from accounts older than 7 days with a verified passkey.
- No starring your own work; stars from accounts that only ever star one
  author are weighted down.
- Counters are rate-limited per hashed address; a spike far above an item's
  usual curve is held for the reviewer before it counts.
- Ranks use a Wilson lower bound or Bayesian average, not raw totals, so
  three five-star votes never beat three hundred four-star ones.
- Every badge rule is published; anything awarded by mistake can be withdrawn
  with a note.

## Badges

**System:** the *family* is the stock it is cut from, the *tier* is the
material. This keeps hundreds of badges legible as one set.

| Family | Shape | For |
| --- | --- | --- |
| Lessons | turned disc | authors of lessons |
| Plugins | hex stock | authors of plugins |
| Learning | milled plate | everyone who learns |
| Community | ring (later) | reviewers, reporters, early supporters |

| Tier | Material | IOR | Metal inside | Typical threshold (×) |
| --- | --- | ---: | --- | --- |
| 1 | Quartz, clear | 1.46 | brushed silver | 1 / 10 |
| 2 | Sapphire, blue | 1.77 | platinum | 100 |
| 3 | Emerald, green | 1.57 | gold | 1 000 |
| 4 | Diamond, with dispersion | 2.42 | polished gold | 10 000 |

### First set

**Lessons:**
- *First lesson*: the first approved lesson.
- *Chapter maker*: a lesson with 10+ named chapters.
- *Stepped into*: learners opened your model N times (10 / 100 / 1k / 10k).
- *Teacher*: N learners finished your lessons.
- *Series*: five lessons from beginner to advanced.
- *Evergreen*: a lesson still finished every month after a year.

**Plugins:**
- *First plugin*: the first approved plugin.
- *Installed*: N active installs.
- *Offline hero*: N active installs without the network permission.
- *Clean review*: five versions approved with no findings.
- *Fixed fast*: a reported problem fixed and approved within 7 days.
- *Long-lived*: maintained for a year.

**Learning:**
- *First step*: the first lesson finished.
- *Streak*: a lesson finished every week for N weeks, the weekly ring of the
  Apple Watch, not a daily guilt trip.
- *Level up*: finished beginner, then intermediate, then advanced.
- *Made it mine*: stepped into a lesson and kept the project.

**Special (rare, never tiered):**
- *Founding author*: among the first 50 to publish.
- *Reviewer*: reviews on a server.
- *Good catch*: a report that led to a revocation.

All twelve, in all four materials, ray traced:
`renders/<badge>-<tier>.png` (512 px, transparent), overview in
`docs/screens/badges-rendered.png`. Flat versions for small sizes:
[`drafts/gallery.html`](drafts/gallery.html), photographed in `docs/screens/badges-flat.png`.

### The final badges: the Bezier Pantheon

The renders below are the working set. The final badges are to be built in
Blender as **sculptures**: Greek myth in crystal, bronze, gold and marble
(Prometheus lifting the first solid, Athena guiding a student's hand, Atlas
holding a sphere of plugins…). The family becomes the plinth (round, hex,
square) and the tier becomes the material recipe (Bronze, Sapphire, Emerald,
Mythic). The prompts for an agent working in Blender, with the full art
direction, materials, light rig and a critique loop, are in
[`blender/PROMPTS.md`](blender/PROMPTS.md).

### Visuals: glass, gold, ray traced

Each badge is a **block of glass with its mark suspended inside as metal
wire**, like a paperweight, with a metal frame just inside the edge.
`blender/badges.py` builds and renders every one in Cycles:

- **Physically based glass:** Principled BSDF, full transmission, the
  material's real IOR (table above), a clear coat, and **dispersion** on
  diamond (0.044) so edges split light into colour.
- **Metal:** gold (0.08–0.14 roughness), platinum and brushed silver.
- **Light:** a key softbox top left, a cool rim light behind, a warm kick
  from below, and a glowing sweep behind the badge that the camera never sees
  directly; glass is only as bright as what it refracts. Caustics on, 24
  bounces (20 through glass), AgX tone mapping, denoised.
- **Transparent background**, so the same render sits on Bezier's dark and
  light surfaces.

```bash
pip install bpy            # Blender as a Python module (5.2); or run inside Blender
python blender/badges.py --out renders --size 512 --samples 128
python blender/badges.py --only teacher --tier diamond --size 2048 --samples 1024 --blend teacher.blend
```

The `--blend` file is the starting point for the hand-finished versions in
Blender: better marks (modelled, not wire), a turntable, close-ups.

Next steps:
1. **Model the marks in Bezier** as real parts (the cube of *First lesson* as an
   actual extrusion). The models become lessons of their own (*Make the
   Teacher badge*).
2. **Turntables:** a 3-second loop per badge, rendered the same way, shipped as
   WebM/MP4. Lessons has no WebGL of its own and does not need it: the video
   plays when a badge is earned, the still is used everywhere else.
3. **Printable:** every badge with its STEP/STL. Makers will print their badge
   in clear resin, and that is the most Bezier reward there is.

### The moment you earn one

A quiet glass sheet over the page: the turntable plays once, the name, what
you did, *Share* and *Done*. Nothing else moves. `prefers-reduced-motion`
shows the still. Earned badges are never taken away for inactivity.

## Profiles, sharing, embeds

- **Profile** per server: `/@name`: badges, published lessons and plugins,
  totals. Private unless the user makes it public.
- **Share card**: a 1200×630 image rendered on the server (badge still, name,
  what it is for), so a link on any social network shows the badge.
- **Embed**, like a README shield: `/@name/badges.svg` and
  `/lessons/:id/stars.svg`, cached and monochrome.
- **Verifiable**: each award is an Open Badges 3.0 credential (a W3C Verifiable
  Credential) signed with the server's key. A badge pasted elsewhere can be
  checked against the server that awarded it, and that is what makes it worth
  having when there are many independent servers.

## Leaderboards

Per server, never global (servers have different audiences and rules).

| Board | Ranked by | Window |
| --- | --- | --- |
| Top lessons | finishes + step-ins, star-weighted, Wilson bound | week · month · all time |
| Top plugins | active installs, star-weighted | week · month · all time |
| Rising | growth against the item's own previous four weeks | week |
| New and noteworthy | the reviewer's picks from the last 30 days | — |
| Top authors | sum of the above over their work | month · all time |

Rules: one level filter for lessons (beginner boards matter most); a newcomer
lane so the top ten are not the same forever; authors can opt out of boards
without losing badges; ties broken by recency, never by upload count.

## Rewards: what people actually get

| | What | When |
| --- | --- | --- |
| **Visibility** | featured row on Lessons home and the plugin store; "Rising" | phase 3 |
| **Standing** | profile, verified-author mark after Clean review ×5, shareable cards | phase 2–3 |
| **Objects** | printable STL/STEP of every badge, for clear resin | phase 4 |
| **Access** | early builds, a say in the plugin API, the reviewers' channel | phase 4 |

No money changes hands: no tips, no paid lessons, no creator fund. Like
GitHub's achievements, the reward is recognition and reach.

## Roadmap

Each phase ships on its own and is useful without the next.

**Phase 0: count** (both servers)
- Daily counters table; `POST /v1/events` (finished, stepped-in) with device
  id, salted hash, rate limit; active installs from the existing update check.
- The app sends events only while `countingEnabled()` is true.
- *Already built:* the intro, the switch (on by default), the points table.
- *Done when:* counts per item per day exist, with no table holding anything
  that identifies a person, and turning the switch off stops every event.

**Phase 1: accounts and stars**
- Optional accounts with passkeys (WebAuthn), no passwords; existing upload
  tokens linked to an account.
- Stars on lesson and plugin cards; star counts in the catalogue.
- *Done when:* a person can sign in with a passkey, star, unstar, and see the
  count update; the gaming rules above are enforced and tested.

**Phase 2: badges**
- Points and badges awarded **automatically**: definitions as data
  (`{ id, family, tiers, rule }`), evaluated nightly against the counters with
  `app/points.ts`; an `awards` table; Open Badges credentials signed.
- The earned moment in the app; profile page with badges.
- Turntables for the first twelve (stills are done); STL/STEP files.
- *Done when:* the first twelve badges are awarded by rule, shown, verifiable,
  and photographed light and dark.

**Phase 3: leaderboards and sharing**
- The boards above; share cards; embeds.
- Featured row on Lessons home and the plugin store.
- *Done when:* boards are stable under a replayed week of real traffic and a
  simulated star ring is caught.

**Phase 4: rewards you can hold**
- Printable badges; verified authors; early access for top contributors.

## What it needs from the servers

```
accounts (id, name, passkey, created_at, public)
stars (account, kind, item, created_at)                -- unique (account, kind, item)
counters (kind, item, day, event, n)                   -- daily aggregates only
awards (account, badge, tier, awarded_at, credential)  -- signed JSON
badges (id, family, rule_json, tiers_json)
```

## Decided

1. **Colour:** yes. The badges are coloured glass and gold; the interface
   around them stays monochrome.
2. **Counting:** on by default, introduced on the first visit, one switch to
   turn it off.
3. **Awards:** automatic, by published rules.
4. **Money:** none. Recognition and reach only.
