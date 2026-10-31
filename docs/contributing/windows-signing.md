# Signing the Windows installer

Chrome, Edge and some virus scanners warn about the Windows installer: "may be a virus", or "not
commonly downloaded". Bezier is not a virus, and a warning is not a verdict, but the warning is
real and it puts people off. This page says where it comes from and what the release workflow
does about it.

## Where the warning comes from

The installer and the app are **not signed**. A browser or scanner then has only the file to go
on, and a file nobody has downloaded before looks the same as a harmful one. A signature ties the
file to a publisher, so that reputation builds up on the publisher and not on each new build.

Signing is the usual cure, and what the vendors ask for when you report a false alarm. It does
not promise that every warning is gone on the first day.

What can be checked on a Windows machine without a certificate: the installer's SHA-256 matches
`SHA256SUMS-Windows.txt` of the release, and Microsoft Defender finds nothing in the installer or
the installed app. That shows the file is the one that was built. It does not remove the warning.

## What the workflow does

`.github/workflows/release.yml` signs the Windows build when it is given a certificate, and builds
unsigned, with a warning in the log, when it is not or when the certificate does not import. The
macOS build works the same way with its own secrets.

Two ways to give it one:

| | Secrets and variables | Use when |
| --- | --- | --- |
| A certificate file | `WINDOWS_CERTIFICATE` (the `.pfx`, base64), `WINDOWS_CERTIFICATE_PASSWORD` | The key can be exported. The workflow imports it and Tauri signs the app, the MSI and the installer with it, and timestamps them (`WINDOWS_TIMESTAMP_URL` changes the default server). |
| A signing tool | `WINDOWS_SIGN_COMMAND`, for example `my-signer --file %1` | The key stays with the provider (a hardware token or a cloud service), which is how new certificates are mostly issued. Tauri calls the command once per file; `%1` is the file. The workflow needs a step that installs the tool and logs in. |

Nothing has been built or signed with either yet, so the first signed run is also their first
test.

## Where a build came from

Signing says who published a file. A second check says how it was made: from the next release on,
the release workflow has GitHub attest each installer, in the public repository the release is built
in. The attestation names the workflow and the commit, so a file can be traced to the open source it
was built from:

```bash
gh attestation verify Bezier_0.2.0_x64-setup.exe --repo ProfessorEngineergit/bezier-app
```

It proves the origin, not that the code is harmless, and it does not take the warning away. Builds
before it have none, 0.1.0 included.

## Choosing a certificate

This is the maintainer's decision: it costs money or needs an identity check, and the name in the
certificate is the name people see. The options that come up for an open source project:

- A program for open source projects that signs the builds in its own service (SignPath Foundation).
  It does not fit the two ways above: the workflow uploads the finished installer, the service
  signs it, and a further step downloads it again. That step is not wired yet, since it needs the
  project approved first and the service's own identifiers.
- A cloud signing service, billed by the month, with an identity check of the publisher.
- A certificate from a certificate authority, on a hardware token or in its cloud.

## When a warning stays

Even signed, a new publisher starts without reputation. Two things help: reporting the file as safe
to the vendor that flagged it (Google's Safe Browsing and Microsoft's security intelligence team
both take submissions, as do the scanner makers), and keeping the publisher name the same from
build to build.
