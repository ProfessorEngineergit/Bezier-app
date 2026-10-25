# Security

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting ("Report a vulnerability" on the
Security tab), or email the maintainers.

Please include what the problem is, how to reproduce it, and what an attacker
could do with it. A proof of concept helps a great deal.

You will get an acknowledgement within a few days. Once there is a fix, you will
be credited unless you would rather not be.

## What we consider a vulnerability

The app runs entirely in the browser and holds the user's own documents, so the
interesting risks are about what a malicious *file* can do:

- **Malicious CAD file leading to code execution.** STEP and other import formats
  are parsed by OCCT, which is a large C++ codebase compiled to WebAssembly. The
  WASM sandbox is a real boundary, but parser bugs are worth reporting.
- **Escaping the WebAssembly sandbox.**
- **Reading documents across origins**, or any path by which one site could reach
  another's OPFS storage.
- **Data exfiltration.** The app is local-first and should make no network
  requests once loaded. Anything that sends document contents anywhere is a
  serious bug, whether malicious or accidental.
- **Cross-site scripting**, including via document metadata such as a file name.
- **Supply chain problems** in dependencies we ship.

## What we do not consider a vulnerability

- A malformed CAD file crashing the app or the kernel tab, without memory
  disclosure or code execution. Kernel operations fail on bad input by design.
- Denial of service via a deliberately enormous model.
- Missing hardening headers on a deployment we do not control.

## Scope

The code in this repository. Vulnerabilities in Open CASCADE, planegcs, or
Three.js should go upstream, though please tell us too, so we can pin or patch.

## Supported versions

The project is pre-release. Only the latest commit on the default branch is
supported. This section gets a real policy at 1.0.
