# Licensing, in plain language

This is the human-readable version. The [`LICENSE`](../../LICENSE) file is what actually
binds; where the two disagree, the LICENSE wins.

> ⚠️ **This document has not been reviewed by a lawyer.** It says what the licence
> choice is meant to do. Someone qualified must read the licences, the trademark
> rule and the third-party plan before the first public release.

---

## The short version

**Free and open source.** Anyone may use it, for anything, read it, change it and pass
it on. What is passed on stays open.

## Which licence covers what

| What | Licence |
| --- | --- |
| The application: everything in this repository that is not named below | [GNU General Public License, version 3 or later](../../LICENSE) (`GPL-3.0-or-later`) |
| The servers: `apps/sync-server/`, and in `packages/lessons/community` every directory named `server`, and `dev/` | [GNU Affero General Public License, version 3 or later](../../apps/sync-server/LICENSE) (`AGPL-3.0-or-later`) |
| The plugin SDK: `packages/plugin-sdk/`, so a plugin can be under any licence | [MIT](../../packages/plugin-sdk/LICENSE) |
| The name and the logo | Not licensed: [`docs/legal/trademarks.md`](trademarks.md) |
| The geometry kernel, the sketch solver, the renderer and the other libraries | Their own: [`docs/legal/third-party-licenses.md`](third-party-licenses.md) |

## What you may do

- **Use it**, at home, at school, in a company of any size, to make things you sell.
  Nobody pays and nobody has to ask.
- **Read all of it.**
- **Change it**, for yourself, without telling anyone.
- **Pass it on**, changed or not, and even sell copies.

## What is asked in return

- **If you pass it on, pass the source on too**, under the same licence. A changed
  version that is given to other people stays open.
- **If you run a changed server for other people**, they are entitled to its source.
  That is the difference between the two licences: with the application, the
  obligation starts when you hand someone a copy; with a server, it starts when
  someone uses it over a network.
- **Keep the notices**: who wrote it and under which licence.

Using the application or a server exactly as published asks nothing of you.

## May I fork it?

**Yes.** That is what makes it open source, and the earlier licence did not allow it.

A fork has to stay under the same licence, so nothing that is built on this can be
closed, and anything good in a fork can come back here. A fork has to carry another
name: the code is everyone's, the name is not ([`docs/legal/trademarks.md`](trademarks.md)).

## Is this "open source"?

**Yes.** Both licences are approved by the Open Source Initiative and are free
software licences as the Free Software Foundation defines them.

[ADR 0016](../adr/0016-open-source.md) has the reasons for this choice.

## What can and cannot be taken back

**A version that is out stays open, forever.** A licence granted to the public is not
revoked by editing a file.

**The licence of contributed code cannot be changed by one person.** Contributors keep
their copyright and sign nothing over ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)). To put a
later version under other terms, everyone whose code is in it would have to agree. The
"or later" in the licence name allows one thing without asking: moving to a later
version of the same licence, should the Free Software Foundation publish one.

That is a deliberate limit on the maintainer. It is what lets someone build on this
without wondering whether it will be closed.

## How the project is paid for

Not by the licence. Nobody is charged for using it.

Donations, and later a hosted version (sync and community) run by the project for a fee,
are the plan. Neither exists yet. Running your own server stays free; the hosted one is a
convenience, not a licence.

## The dependencies

The app is built on libraries that stay under their own licences:

| | Licence | Notes |
| --- | --- | --- |
| **Open CASCADE (OCCT)** | LGPL-2.1 with an exception | The geometry kernel. |
| **planegcs** | LGPL | The 2D constraint solver, from FreeCAD. |
| **Three.js** | MIT | The renderer. |

Both LGPL libraries are compiled to WebAssembly and **ship as separate `.wasm` files
that the app loads at runtime**. They are never inlined into the JavaScript bundle, and
the URL they load from is configurable, so you can build your own version of either and
substitute it. That is how the LGPL's requirement is met that a user can replace the
library. Build recipes and pinned upstream versions live in `third_party/`.

Full attributions: [`docs/legal/third-party-licenses.md`](third-party-licenses.md).

> ⚠️ **Open questions for the legal review.**
>
> - How the LGPL applies to WebAssembly modules loaded at runtime in a browser has
>   little precedent. The approach above is the conservative one.
> - Whether every dependency's licence may be combined with the GPL has **not** been
>   checked one by one. The kernel and the solver are LGPL, which may; the rest are
>   mostly MIT and Apache-2.0, which may. "Mostly" is not "all".
> - Much of this code was written with AI assistance. How far such code is protected
>   by copyright is not settled, and a licence rests on copyright.
