# ADR 0003: License model: PolyForm Noncommercial + CLA

- **Status:** Superseded by [ADR 0016](0016-open-source.md) on 2026-10-13. Kept as the record of what was decided and why.
- **Date:** 2026-08-04

> ⚠️ HUMAN DECISION / LEGAL REVIEW REQUIRED. This ADR is engineering research,
> not legal advice. Neither the maintainer nor the author of this document is a
> lawyer. **A qualified lawyer must review the license choice, the CLA, and the
> LGPL compliance plan before the first public release.**

## Context

The business model is: free for people, paid for companies. Specifically -
individuals, students, hobbyists, schools, universities, and nonprofits use it for
free forever; every company, of any size, buys a license. Company revenue funds
the project so it can stay free for everyone else.

Requirements:

| # | Requirement |
| --- | --- |
| (a) | Free for individuals, schools, and nonprofits; **all** companies pay |
| (b) | Source public, contributions welcome |
| (c) | Maintainer retains the ability to relicense future versions |
| (d) | Compatible with linking LGPL OCCT and planegcs |

## Decision

**License the application code under [Polyform Noncommercial
1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)**, with a
separately negotiated commercial license sold to companies.

Require a CLA (Contributor License Agreement) from all contributors.

Do not describe the project as "Open Source" in the OSI sense. Describe it as
*openly developed and source-available*. See "On the word 'open source'" below -
this is a deliberate decision with a real reason behind it.

## Rationale

### Why Polyform Noncommercial exactly matches the requirement

It contains a clause that could have been written for this project:

> Noncommercial Organizations, Use by any charitable organization,
> educational institution, public research organization, public safety or
> health organization, environmental protection organization, or government
> institution is use for a permitted purpose regardless of the source of funding
> or obligations resulting from the funding.

> Personal Uses, Personal use for research, experiment, and testing for the
> benefit of public knowledge, personal study, private entertainment, **hobby
> projects**, amateur pursuits, or religious observance, without any anticipated
> commercial application, is use for a permitted purpose.

Schools free. Universities free. Nonprofits and government free. Hobbyists free.
Any commercial use, of any size, needs a license from us. That is the stated
model, in a standard document, with no bespoke drafting.

It also permits modification and redistribution for permitted purposes, which
is what makes real community contribution possible rather than decorative.

It is SPDX-registered as `PolyForm-Noncommercial-1.0.0`, so tooling
(dependency scanners, GitHub, SBOM generators) recognises it.

It has no change date, so requirement (c) is satisfied as fully as any license
can satisfy it.

### Why not the obvious alternatives

| License | Verdict |
| --- | --- |
| **MIT / Apache-2.0** | Companies use it free forever. No revenue, no project. |
| **GPL / AGPL** | Viral. Blocks the commercial license, and OCCT/planegcs are LGPL, not GPL. Chili3D is AGPL and cannot be commercialised the way we intend. |
| **FSL 1.1** | **Fails (a).** Its text explicitly permits *"your internal use and access"*, a 500-person company uses it free. It is an anti-cloud-provider license, not a free-for-humans license. Also grants an *irrevocable* Apache-2.0 conversion after 2 years. |
| **Elastic v2** | **Fails (a)** for the same reason, only hosted-service resale is restricted. |
| **BSL 1.1** | Could pass (a) via a custom Additional Use Grant, but forces a mandatory change date of ≤4 years and requires bespoke legal drafting. A legitimate fallback, not the first choice. |
| **PolyForm Small Business** | Free for companies under 100 people / $1M revenue. Rejected: the maintainer's decision is that *every* company pays. |

### Why a CLA and not a DCO

A DCO only certifies that a contributor had the right to submit their work
under the project's existing license. It grants the maintainer nothing further.

Under a DCO, once a contributor's code is in the tree, selling a commercial
license covering that code requires **that person's individual permission,
forever**. One unreachable contributor can block the business model permanently.

A CLA with a broad copyright and patent grant, plus an explicit right to
relicense and sublicense, including under proprietary terms, is what makes the
commercial license saleable. It is not optional given the model.

Costs, accepted knowingly: CLAs deter drive-by contributors. Mitigate by using a
standard template (Apache ICLA-derived), automating sign-off with a bot, and being
transparent in `CONTRIBUTING.md` about why it exists.

## On the word "open source"

The project is developed in the open: public repository, public issues, public
roadmap, contributions welcome and merged, source readable and modifiable by
anyone. In the everyday sense, it is an open project, and that is how the README
frames it.

But Polyform Noncommercial is not an OSI-approved open source license, because
the Open Source Definition forbids restricting fields of endeavour, including
commercial use. Describing the project as "open source" in marketing would be
inaccurate by the definition the developer community actually enforces.

This is not pedantry. Projects that blurred this line, Elastic, HashiCorp, Redis
- took serious, lasting reputational damage, and in two of three cases were forked
by their own communities. The cost of being precise is one sentence. The cost of
being loose is a hostile front page and a fork.

Approved language: "open development", "source-available", "the source is
public and contributions are welcome", "free for people, paid for companies".
Language to avoid: "open source", "OSS", "FOSS", "libre".

## LGPL compliance plan

This is the part of the license decision that constrains engineering.

### OCCT: straightforward

LGPL-2.1 **with `OCCT-exception-1.0`**, which permits static linking into
closed-source applications given prominent notice.

Obligations: attribute OCCT in the README, the in-app About dialog, and
`docs/legal/third-party-licenses.md`; reproduce LGPL-2.1 and the exception text.

### planegcs: constrains the architecture

LGPL with no linking exception. LGPL §6 requires that a user be able to relink
the combined work against a modified version of the library. Therefore:

1. **Ship `planegcs.wasm` as a separate runtime artifact.** Never inline it as
   base64, never bundle it into JS. The user must be able to substitute their own
   build. At 496 KB this costs nothing.
2. **Do the same for `occt-wasm.wasm`**, not strictly required given the OCCT
   exception, but consistent, and we want lazy loading and long-lived caching
   anyway. `occt-wasm` supports overriding the `.wasm` URL for exactly this.
3. **Publish source and build recipes** for both `.wasm` artifacts with pinned
   upstream commits, under `third_party/`.
4. **Ship a documented relink procedure**, a short "build and substitute your own
   kernel or solver WASM" page. This is the practical discharge of LGPL §6.
5. **Never modify OCCT or planegcs sources inside `packages/`.** Patches live in
   `third_party/` and are themselves LGPL.

Our code merely *uses* these libraries across a WASM module boundary, making it a
"work that uses the Library" rather than a derivative of it.

> ⚠️ LEGAL REVIEW: LGPL §6 was written for native dynamic linking in 1999. Its
> application to WebAssembly modules loaded at runtime in a browser is **not
> settled and has little precedent.** The plan above is the conservative
> over-comply reading. If counsel is uncomfortable, the fallback is to make the
> solver a fully runtime-loaded plugin, strengthening the separation further.

### Three.js

MIT. Attribution only.

## The limitation we state publicly

You can relicense the future. You cannot un-publish the past.

Every published version stays available under the license it shipped under,
permanently. Polyform Noncommercial permits redistribution, so anyone who received
a version keeps the right to pass it on, meaning **the project can always be
forked from any past release.** A license change affects only versions published
after it.

What the CLA buys is the ability to change terms going forward and to sell
commercial licenses now. It is not a kill switch, and we will not imply that it is.

This is stated plainly in `docs/legal/licensing.md` and the README. Being honest about the
limits of our own control is cheap and buys real trust.

## Consequences

- Every source file carries an SPDX header: `SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0`.
- `CLA.md` must be reviewed by a lawyer and automated with a bot before we accept
  outside contributions.
- The commercial license needs terms and a price. Not blocking, but note the
  Ondsel precedent: hobbyist enthusiasm does not automatically convert to company revenue.
- **The name should be trademarked separately from the code license.** Trademark
  is the main practical lever a source-available project retains, a fork may use
  the code but not the name.
