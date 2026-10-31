# Applying to SignPath Foundation

[SignPath Foundation](https://signpath.org/) signs open source builds without charge. This page
lists what its [terms](https://signpath.org/terms) ask for, what the repository already shows, and
what the maintainer still has to say or decide. The terms are marked as a draft on their page, so
read them again before applying.

Nothing here is true yet. Until the project is accepted, no page of Bezier may say that SignPath
signs it.

## The conditions, and where Bezier stands

| Condition | Where Bezier stands |
| --- | --- |
| An OSI-approved licence for every component, no commercial dual licensing | The app is GPL-3.0-or-later, the servers AGPL-3.0-or-later, the plugin SDK MIT, and there is no CLA ([ADR 0016](../adr/0016-open-source.md)). |
| No proprietary or non-open-source components | The app bundles `occt-wasm` (LGPL). It is built from the maintainer's fork [better-occt](https://github.com/ProfessorEngineergit/better-occt), branch `bezier`, commit `eb4358b` (version `5.3.5-bezier`), which is public once the repository is. Say this in the application. Whether SignPath counts a fork as fine is for SignPath to say. |
| Actively maintained, and the version to sign already released | Version 0.1.0 is released. |
| Functionality described on the download page | There is a download page; whether its text says enough was not checked. |
| Signing team owns the repository and builds only its own source | The public repositories are the maintainer's and the release workflow builds them. |
| Binaries built from source in a verifiable way, build scripts count as source | The workflow is in the repository and, from the next release, GitHub attests each file ([windows-signing.md](windows-signing.md)). The prebuilt `occt-wasm` is checked in under `vendor/occt-wasm`; its source is the commit named above. |
| Multi-factor sign-in for everyone with access, to SignPath and to the repository | **The maintainer** turns it on and says so. |
| Roles: authors, reviewers, approvers; every release approved by hand | **The maintainer** names who holds which. With one maintainer that is one name in all three. |
| A "Code signing policy" page, linked from the home and download pages | Written: [the page](https://bezier-cad.xyz/code-signing/) (`website/pages/5-code-signing.html`), linked from the footer of every page and from the download page. |
| The attribution sentence on that page | Only after acceptance. |
| A privacy statement, or the words that nothing is sent unless the user asks | Written for the app on the privacy page (no telemetry, no update check, the optional servers, Report a problem). **The maintainer** still fills in who is responsible, log retention and GDPR rights (the notice at the end of that page). |
| No unannounced changes to the system, and an uninstaller | The Windows installer ships an uninstaller. Whether it announces all it changes is not checked. |
| A verifiable reputation for executable programs | The project is new. SignPath decides, and the decision is theirs alone. |

## What the policy page has to contain

Four things, taken from the terms, to fill in once the project is accepted:

1. The title "Code signing policy", on the home page and on the download or release pages.
2. That free code signing is provided by SignPath.io and the certificate by SignPath Foundation.
3. The roles and who holds them.
4. The privacy statement, or a link to it.

Signed files show "SignPath Foundation" as the publisher, not "Bezier".

## After acceptance

The workflow gets a step that uploads the finished installer, waits for the signing request to be
approved and downloads the signed file. It needs the identifiers SignPath hands out, so it cannot be
written before. The two hooks in [windows-signing.md](windows-signing.md) do not cover it.
