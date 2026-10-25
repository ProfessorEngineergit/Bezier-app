# ADR 0010: Polyform Strict: no forking, for now

- **Status:** Superseded by [ADR 0016](0016-open-source.md) on 2026-10-13. Kept as the record of what was decided and why.
- **Date:** 2026-08-05

> ⚠️ LEGAL REVIEW REQUIRED, as with ADR 0003. Neither the maintainer nor the
> author of this document is a lawyer. The supplemental contribution grant in
> particular is bespoke drafting and must be reviewed before first release.

## Context

[ADR 0003](0003-license-model.md) chose Polyform Noncommercial 1.0.0, which
permits modification and redistribution for noncommercial purposes. That means
anyone may fork the project and publish their fork.

The maintainer's decision is that forking should not be permitted yet, revisit
once the product is clearly ahead of anything a fork could offer.

## The window is open, and it closes at first release

This is the fact that makes the decision easy right now and expensive later.

ADR 0003 states it plainly: a licence granted to the public cannot be revoked.
Every published version stays available under the terms it shipped with, forever.

Nothing has been published. There is no release, no tag, no public repository.
So changing the licence today costs nothing, and there is no version in the wild
under permissive terms that anyone can fork from.

After the first public release under Noncommercial terms, that release is
forkable permanently, and no later change can undo it. The choice is available
now and never again on the same terms.

## Decision

Polyform Strict 1.0.0, plus a narrow supplemental grant for contributions.

Strict keeps exactly what the model needs and removes what the maintainer wants
removed:

| | Noncommercial 1.0.0 | **Strict 1.0.0** |
| --- | --- | --- |
| Individuals, hobbyists, students | free | free |
| Schools, universities, nonprofits, government | free | free |
| Companies | pay | pay |
| **Modify** | yes | **no** |
| **Redistribute / fork** | yes | **no** |

The free-for-people, paid-for-companies model is unchanged. Only the right to
change and republish goes away.

### The contribution problem, and the carve-out

Strict permits no modification and no distribution. Taken literally, that makes
contribution impossible, opening a pull request on GitHub requires forking the
repository and modifying it. Every contributor would be in violation before
writing a line.

So the LICENSE file carries a supplemental grant permitting copying and
modification solely to prepare and submit a contribution, with a public fork
used to open a pull request explicitly allowed. It does not permit maintaining a
derivative or redistributing.

Without this the project would be source-visible with no contribution path, which
is a different and much weaker thing than what is intended.

## Consequences

### What is gained

- No competing fork can be published while the product is still establishing
  itself.
- The commercial licence is the only route for company use, with no permissive
  alternative to point at.
- Combined with the CLA, the maintainer keeps full control of the codebase's
  future.

### What is given up, honestly

- **This is further from open source than ADR 0003 was, and it will be noticed.**
  Under Noncommercial, a user could at least modify their own copy. Under Strict
  they cannot, not even to fix a bug for themselves. Some people will decline to
  contribute on principle. That is a real cost and it should not be minimised.
- The word "open source" was already inaccurate ([ADR 0003](0003-license-model.md));
  it is now clearly so. Language discipline matters more, not less. Approved:
  "source-available", "the source is public", "openly developed". Never: "open
  source", "OSS", "FOSS".
- A user who hits a bug cannot patch their own build. That raises the cost of
  every unfixed bug, and makes responsiveness to issues a product requirement
  rather than a courtesy.
- The contribution carve-out is bespoke text. Standard licences are safer than
  drafted ones, and this needs a lawyer's eye.

### What does not change

- LGPL obligations for OCCT and planegcs are unaffected. Those are *their*
  licences, and the requirement to ship the `.wasm` files separately and let
  users substitute their own builds stands exactly as in
  [ADR 0003](0003-license-model.md).
- Free for individuals, schools, nonprofits, government.
- The CLA is still required, for the same reason.

## Revisiting

The maintainer's intent is that this is temporary, reconsider once the product is
clearly ahead of what a fork could offer.

Two things to know when that time comes:

1. **Loosening is easy, tightening is not.** Moving from Strict to Noncommercial,
   or to something more permissive, can be done at any moment. Moving the other
   way is only possible before a release under looser terms.
2. **It is a one-way door in one direction only.** Which is exactly why the
   restrictive choice is the safe one now, and why revisiting later carries no
   risk.

## Alternatives considered

| Option | Why not |
| --- | --- |
| **Keep Noncommercial** | Permits forking, which is the thing being ruled out. |
| **PolyForm Internal Use** | Permits modification but not distribution. Closer, but it still allows a company to maintain a private derivative, and its framing is about internal business use rather than noncommercial use. |
| **Fully proprietary, source closed** | Loses the transparency and the contribution path, which are load-bearing for how this project is being built. |
| **Source-visible with no licence at all** | Legally worse than a restrictive licence: with no grant, even *using* it is unlicensed, and users have no certainty at all. |
