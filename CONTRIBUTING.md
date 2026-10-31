# Contributing

Thanks for wanting to help! Every contribution is welcome: a bug report, a fix, a lesson, a
plugin, a better sentence in the docs. If you have never worked in a big codebase before, this
page walks you through it.

Help on **Windows** is especially welcome. The maintainer has no Windows machine and tests it in
a virtual machine, so Windows gets the least real use. Using it and reporting what breaks is
already a real contribution.

---

## Before anything else: the licence, and the sign-off

**This is open source.** The application is under the GNU General Public License, version 3 or
later, and the servers are under the GNU Affero General Public License, version 3 or later
([`docs/legal/licensing.md`](docs/legal/licensing.md), [ADR 0016](docs/adr/0016-open-source.md)). You may use it, read
it, change it and pass it on, and what you pass on stays open.

## The sign-off

**There is no contributor agreement to sign.** A contribution comes in under the same licence as
the file it changes, and you keep your copyright.

What is asked is one line at the end of each commit message:

```
Signed-off-by: Your Name <you@example.com>
```

`git commit -s` writes it. With it you state the
[Developer Certificate of Origin](https://developercertificate.org/): that the work is yours to
give, or that you have the right to pass it on under the project's licence.

**What this means for the project:** because nobody hands their rights to the maintainer, the
licence of what has been contributed cannot be changed by one person, the maintainer included.
The project cannot be closed later. That is deliberate.

## How we use AI

Bezier is written partially with the help of AI coding assistants, and that is fine for contributions too.
What matters is that you understand what you send: say in the pull request which tool you used
and for what, and be ready to explain every line without it. The tests and the review are the
same either way.

## The tour: how this codebase is laid out

If you have not worked in a monorepo before, the structure looks like more than it
is. The code is seven directories; everything else is around them.

```
packages/kernel     talks to the geometry engine
packages/solver     talks to the constraint solver
packages/core       the parametric model — our actual product
packages/renderer   draws things
packages/ui         React components
apps/studio         the app that glues them together
docs/               why everything is the way it is
```

And the rest of the repository, so nothing in the top level is a mystery:

| | |
| --- | --- |
| `apps/desktop` | The Mac, Windows and Linux app: a small Rust shell around the studio build |
| `apps/sync-server`, `apps/mcp-server` | The server for shared projects, and the server that lets an assistant read the app |
| `packages/storage`, `packages/sim`, `packages/lessons` | The journal on disk, the simulation, the Learn mode |
| `crates/sim` | The native simulation core, in Rust |
| `e2e/` | End-to-end tests in a real browser |
| `bench/`, `scripts/` | Performance measurements and the tools that run them, release and checks |
| `tools/spikes/` | Experiments that answered an architecture question |
| `docs/brand/` | The logo and how the name was chosen |
| `.github/` | CI, the release build, issue and pull request templates |

What is tested how is in [`docs/contributing/testing.md`](docs/contributing/testing.md).

**The one rule that explains the whole structure:** each layer may only use the
layers below it. `ui` can use `renderer`, `renderer` can use `core`, `core` can use
`kernel` and `solver`. Never the other way around, and never skipping past a layer
to reach a dependency directly.

That rule exists so that replacing the geometry engine, which we may well need to
do, means rewriting one folder instead of the whole application.

### Where to start reading

1. [`packages/core/README.md`](packages/core/README.md), what the product
   actually is, and the hard problem at the centre of it
2. [`packages/core/src/stable-ref.ts`](packages/core/src/stable-ref.ts), how
   geometry is named. Pure logic, well tested, no dependencies. Reading it end to
   end takes ten minutes and explains the core idea.
3. [`docs/architecture.md`](docs/architecture.md), the whole picture

### Where NOT to start

`packages/kernel`, if you are new. Open CASCADE is a thirty-year-old C++ library
with an API from another era, and wrestling it is not a good first experience.

## Setting up

```bash
pnpm install
```

Node 22 or newer, pnpm 9 or newer. That is the whole setup.

```bash
pnpm dev
```

Runs the app at <http://localhost:5173>.

```bash
pnpm check
```

Runs the structure and document-link checks, lint, typecheck, and the unit tests -
exactly what CI runs, in about ten seconds. **Run this before opening a pull
request.** If it passes locally it will pass in CI. If your change touches the
renderer, storage or the app shell, also run `pnpm e2e` (see
[`docs/contributing/testing.md`](docs/contributing/testing.md)).

Individually: `pnpm check:structure`, `pnpm check:links`, `pnpm lint`,
`pnpm typecheck`, `pnpm test`.
`pnpm lint:fix` fixes formatting automatically; do not fix it by hand.

## Good first tasks

Issues labelled [`good first issue`](https://github.com/ProfessorEngineergit/bezier/labels/good%20first%20issue)
are a good place to start. Beyond those:

- **Use it on Windows and report what breaks.** The most useful thing right now.
- **Add a constraint kind** to the solver
  ([`packages/solver/src/gcs-solver.ts`](packages/solver/src/gcs-solver.ts)): self-contained,
  with one fixture per kind in `solver.test.ts`.
- **Write a lesson** for something you know how to model ([`docs/lesson-format.md`](docs/lesson-format.md)).
- **Write a plugin** ([`docs/sdk/`](docs/sdk/README.md)).
- **Improve an error message**: a kernel error shown to a person should say what went wrong in
  their terms, not the library's.

For anything large, open an issue first so we can talk about it before you build it.

## How we work

### Where a pull request goes

To `main` of this repository. From there a change goes through three channels of the app:

| Channel | Who runs it | What it is |
| --- | --- | --- |
| **Alpha** | people with an invite code | `main` as it is, including the features still marked alpha |
| **Beta** | anyone who opts in | the `beta` branch: `main` once it has held up in alpha |
| **Stable** | everyone | the [app repository](https://github.com/ProfessorEngineergit/bezier-app), built from `beta` once it has held up there; the downloads come from it |

### Pull requests

- One change per pull request. A PR that fixes a bug *and* renames some things is
  two PRs.
- Explain **why**, not just what. The diff shows what.
- Add tests for logic. `packages/core` especially, that is where being subtly
  wrong is most expensive.
- Update the docs if you changed how something works.

Commit messages: a short first line that says what changed, then a few lines on why, if it
is not obvious. Plain sentences are fine; no prefix scheme.

### Code style

Biome handles formatting and linting. Do not argue with it, and do not format by
hand, run `pnpm lint:fix`.

Beyond that:

- **TypeScript is strict**, including `noUncheckedIndexedAccess`. `array[0]` is
  possibly `undefined` and you have to deal with it. This catches real bugs.
- **No `any`.** If the types are fighting you, the design is usually wrong.
- **Comments explain *why*.** The code already says what. A comment that restates
  the line above it is noise; a comment explaining why a fillet needs a tolerance
  fudge is gold.
- **Geometry failures are values, not exceptions.** Kernel operations return
  `KernelResult`. See [`packages/kernel/src/errors.ts`](packages/kernel/src/errors.ts)
  for why this is not optional.

### Issues

A bug report needs: what you did, what happened, what you expected, which app (macOS,
Windows, Linux or a browser) and system, and a model if the steps need one (export it as
STEP and attach it). The form asks for exactly this.

Before proposing a large feature, open an issue first. The project has a
narrow focus right now, see [`docs/roadmap.md`](docs/roadmap.md) -
and it would be a shame for you to build something good that does not fit yet.

## Questions

Open a discussion or an issue. "I do not understand how X works" is a perfectly
good issue, and usually means the documentation has a hole in it.

# Thanks for contributing!
