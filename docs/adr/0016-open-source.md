# ADR 0016: Open source: GPL for the application, Affero GPL for the servers, no CLA

- **Status:** Accepted, pending legal review before the first public release. Supersedes
  [ADR 0003](0003-license-model.md) and [ADR 0010](0010-no-fork-license.md).
- **Date:** 2026-10-13

> ⚠️ LEGAL REVIEW REQUIRED. Neither the maintainer nor the author of this document is a
> lawyer.

## Context

ADR 0003 and 0010 made the project source-available: free for people, paid for companies,
no forking. The window ADR 0010 described is still open. Nothing has been published.

What changed is the maintainer's judgement of what that model costs:

- **The product is a web application.** Its code reaches every browser that opens it. A
  licence that forbids changing it does not stop anyone from reading it, and a rebuilt
  "really open" version would have the better story on the first day.
- **It could not be called open source**, and the launch material does.
- **The forks that hurt a project** are, on the record, the ones that follow a project
  closing up or ignoring its users (OpenTofu after Terraform's licence change, Valkey after
  Redis's). Being open from the start, and unable to close, is the protection.

## Decision

1. **The application is `GPL-3.0-or-later`.**
2. **The servers are `AGPL-3.0-or-later`**: `apps/sync-server/`, and in `packages/lessons/community`
   every directory named `server`, and `dev/`.
3. **No contributor agreement.** Commits carry a `Signed-off-by` line (the Developer
   Certificate of Origin). Contributors keep their copyright.
4. **The name and the logo are not licensed** ([`docs/legal/trademarks.md`](../legal/trademarks.md)). A
   changed version that is passed on takes another name.
5. **The plugin SDK is `MIT`** (`packages/plugin-sdk/`), so a plugin may use any licence.

## Why these and not the others

| Option | Why not |
| --- | --- |
| **MIT or Apache-2.0** | Anyone may take the work, close it and sell it. It is the choice for the widest reach, and loosening to it later stays possible for as long as the code is the maintainer's alone. Tightening afterwards is not. So the stricter licence is the one to start with. |
| **GPL for everything, servers included** | A changed server run for other people is not "passed on", so the GPL asks nothing of whoever runs it. The Affero GPL closes that. |
| **Affero GPL for everything** | Possible, and simpler. Not chosen because the application runs on a person's own machine, where the plain GPL already does the job, and some companies do not touch Affero code at all. |
| **A CLA, to keep dual licensing open** | It would let the maintainer sell exceptions or change the licence later. It is also read, rightly, as "this could be closed one day", which is what ADR 0010's own reasoning says causes forks. |
| **Staying source-available** | See the context. |

## What this corrects in ADR 0003

ADR 0003 rejected the GPL as "viral, blocks the commercial licence, and OCCT and planegcs
are LGPL, not GPL". Two of those do not hold as stated:

- LGPL code may be combined into a GPL work. That is what the LGPL is for.
- A sole copyright holder can offer GPL code under a second licence. Dual licensing is
  common. It needs every contributor's rights, which is what a CLA would have been for.

Neither is legal advice, and both belong in the review.

## Consequences

- **Companies use it for free.** The revenue ADR 0003 planned for does not exist. The
  project is paid for by donations and, later, a sync and community service it runs.
- **Forks are allowed** and stay open. Improvements in a fork can be taken back.
- **The licence cannot be changed by the maintainer alone** once someone else's code is
  in. That is intended.
- **`CLA.md` is removed.** `CONTRIBUTING.md` describes the sign-off.
- **TetGen**, listed in [`docs/simulation/ARCHITECTURE.md`](../simulation/ARCHITECTURE.md)
  as "do not ship without a commercial licence" because it is Affero GPL, is no longer
  excluded for that reason. Shipping it would put the application under the Affero GPL.
  Not decided, and nothing ships it today.

## Not done

- The legal review.
- A check of every dependency's licence against the GPL.
- Registering the name, which is not decided.
- A licence for what is not code: the lessons, the films, the pictures.
