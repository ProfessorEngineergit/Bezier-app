# Conventions

Rules that keep the codebase navigable as it grows. Most are enforced by tooling;
where a rule is enforced only by review, it says so.

The point of all of this is locatability, that a person or an agent looking
for something can guess where it is and be right.

---

## Layout

### Every package has the same shape

```
packages/<name>/
  README.md          what it owns, and what it does not
  package.json
  tsconfig.json
  src/
    index.ts         the ONLY public surface
    <concept>.ts     one concept per file
    <concept>.test.ts
```

Enforced by `scripts/check-structure.ts`, run in CI.

### `index.ts` is a surface, not a home

It re-exports. It does not implement. The one exception is a small factory that
wires the package together (`createKernel`, `createSolver`).

If `index.ts` is where you would put a function, make a file for it instead. This
is what stops a package's public API from being "whatever happens to be in
index.ts".

### Files stay under 400 lines

Not a style preference, a locatability rule. A 900-line file cannot be reasoned
about, reviewed carefully, or edited by two people at once.

Enforced by `scripts/check-structure.ts` (warning at 400, error at 600). Tests
are exempt; a long test file is usually fine and splitting it hides coverage.

When a file crosses the line, split by *concept*, never by size. `occt-kernel.ts`
splits into creation / booleans / modification / io, not into `part1` and `part2`.

### Tests live beside the code

`stable-ref.ts` and `stable-ref.test.ts`, same directory. Never a mirrored
`__tests__` tree, it doubles the navigation cost and guarantees the two drift.

## Naming

| Thing | Style | Example |
| --- | --- | --- |
| Files | `kebab-case.ts` | `stable-ref.ts` |
| React components | `PascalCase.tsx`, one per file | `FeatureTree.tsx` |
| Types, interfaces, classes | `PascalCase` | `StableRef` |
| Functions, variables | `camelCase` | `formatRef` |
| Constants | `SCREAMING_SNAKE` | `HASH_UPPER_BOUND` |
| Private class members | `#field` | `#shapes` |
| Deliberately unused params | `_leading` | `_options` |

File names match their main export. `stable-ref.ts` exports the stable-ref
vocabulary. If a file has no obvious main export, it is probably two files.

## Imports

### Layer boundaries

Dependencies point downward only, and the two swappable LGPL dependencies stay in
one package each. Enforced by `noRestrictedImports` in `biome.json`, with a
message on each rule explaining the boundary. A violation fails CI.

```
studio → ui → renderer → core → { kernel, solver }
```

### Always `.js` extensions in relative imports

`import { x } from './y.js'` even though the file is `y.ts`. This is what ESM
requires at runtime and what keeps the code portable across bundlers.

### `import type` for types

Enforced by `useImportType`. Keeps the runtime graph clean and makes it
obvious at a glance what is erased at compile time.

## TypeScript

Strict, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
`array[0]` is possibly `undefined` and you have to deal with it. This is
deliberate and it catches real bugs.

- **No `any`.** Enforced. If types fight you, the design is usually wrong.
- **No non-null assertions (`!`).** Enforced. Handle the case or explain in a
  comment why it cannot happen.
- **No enums.** Union types of string literals instead, they serialise, they are
  erasable, and they read better in a saved document.
- **Brand ids that must not be confused.** `ShapeId`, `FaceHash`. Cheap, and it
  makes a whole class of mistake impossible.

## Errors

Expected failures are values. Bugs are exceptions.

A fillet that does not fit is expected, it returns `KernelResult`. A disposed
shape id being passed back in is a bug, it throws.

Getting this backwards is why some tools lose your work: they treat a normal
geometry failure as a crash. See `packages/kernel/src/errors.ts`.

Error messages are written for a person. "A 5 mm round does not fit on this
edge. Try a smaller radius." Not `BRepFilletAPI_MakeFillet failed`. Raw library
text goes in `detail`, which never reaches the UI.

## Comments

Comments explain why. The code already says what.

```ts
// BAD — restates the line below
// increment the counter
count++;

// GOOD — explains a decision the reader cannot infer
// occt-wasm documents these as triangle offsets. They are index offsets;
// a box returns six groups of 6, summing to its 36 indices, not 12 triangles.
```

Every file starts with a block comment saying what it owns and why it exists.
Every exported symbol that is not self-evident gets a doc comment.

Comments carry the reasoning that would otherwise be lost. A surprising
workaround without an explanation will be "cleaned up" by someone later, and the
bug will come back.

## Performance

Rules apply only to the hot paths in [ADR 0007](../adr/0007-performance-architecture.md):
camera, hover/pick, and sketch drag.

- No allocation per frame. Hoist scratch objects, reuse typed arrays.
- No React re-render on camera movement or hover.
- Typed arrays cross worker boundaries as Transferables, never cloned.

Everywhere else, write normal readable code. Micro-optimising cold paths makes a
codebase worse for no gain.

Budgets and how to measure: [`performance.md`](../performance.md).

## Features, tools, exporters

One file each, registered. No `switch` on feature type outside
`packages/core/src/features/`. See [ADR 0008](../adr/0008-feature-registry.md).

If you are writing a `switch` over feature types, the thing you are switching on
belongs in the feature definition instead.

## Documents and compatibility

Two things are compatibility promises the moment a user saves a file:

1. **The stable-reference text format** (`F:extrude-1:side-2`)
2. **A feature's declared face tags**

Changing either breaks every saved document. Both may only change behind a
document schema version bump and a migration. Called out in the code where they
are defined.

## Commits and PRs

Conventional Commits: `feat(scope):`, `fix(scope):`, `docs:`, `chore:`,
`build:`, `spike(scope):`.

The body explains why. The diff already shows what. A commit message that
survives being read in two years is worth the extra minute.

One logical change per PR. A PR that fixes a bug *and* renames things is two PRs.

## Running the checks

```bash
pnpm check
```

Lint, typecheck, and tests, exactly what CI runs. If it passes locally it passes
in CI. Run it before opening a PR.

```bash
pnpm lint:fix
```

Fixes formatting. Never format by hand, and never argue with the formatter.
