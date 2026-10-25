# ADR 0008: Features are self-contained modules in a registry

- **Status:** Accepted
- **Date:** 2026-08-05

## Context

A parametric CAD tool is, structurally, a list of feature types. Extrude, fillet,
shell, hole, boss, rib, snap-fit, pattern, mirror, sweep, loft. The roadmap has
roughly thirty of them, and the wedge alone ([M3](../roadmap.md)) needs a dozen.

The naive shape is a discriminated union plus a `switch` in the rebuild loop. It
works at three feature types and rots at fifteen, because adding one means editing
the type union, the rebuild switch, the UI panel switch, the serialiser, the
validator, and the naming table. Six edits across six files, every time, each one
an opportunity to forget the sixth.

That is a scaling problem in both directions the maintainer asked about:

- **Horizontally**, two contributors adding two features touch the same six files
  and conflict.
- **Vertically**, the switch statements grow without bound and nobody can see
  what a feature *is* in one place.

## Decision

A feature is one file. It exports a `FeatureDefinition` that declares
everything about itself, and registers into a registry. Nothing else in the
codebase has a `switch` over feature types.

```
packages/core/src/features/
  registry.ts     the registry and the FeatureDefinition contract
  extrude.ts      one feature, everything about it
  fillet.ts
  shell.ts
  index.ts        imports each module so it registers, and nothing else
```

A definition declares:

| Field | Why it lives here |
| --- | --- |
| `type` | The discriminator, and the key in saved documents |
| `label`, `icon` | So the UI needs no lookup table |
| `params` | A schema, validates input, and the property panel is generated from it |
| `faceTags` | The naming contract. Changing it breaks saved files, so it is declared where it can be reviewed |
| `rebuild` | The kernel calls, and only these |
| `hash` | Canonical serialisation for the rebuild cache (ADR 0007) |

Adding a feature is one new file plus one import line. Reviewing a feature is
reading one file. Deleting one is deleting a file.

## Why this shape specifically

The property panel comes from the schema. A parameter declared as
`{ kind: 'length', min: 0, label: 'Distance' }` renders as a correctly-labelled,
correctly-validated, unit-aware numeric input with no UI code written. Thirty
features would otherwise be thirty hand-built panels, and thirty chances for the
sub-millimetre input behaviour to be subtly inconsistent, which is exactly the
kind of inconsistency that makes a tool feel cheap.

The cache key comes from the schema. ADR 0007 needs a canonical hash of a
feature's parameters. Deriving it from a declared schema is reliable; hand-writing
a `hash()` per feature is not.

The face tags are declared, not implied. A saved document referring to
`F:extrude-1:side-2` depends on `extrude` producing a tag named `side-2` forever.
Putting that list in the definition makes it reviewable and lets a test assert
that every feature's actual output matches what it declared.

## The rule that keeps it honest

**No `switch` on feature type outside `features/`.** If you find yourself writing
one, the thing you are switching on belongs in the definition instead.

This is enforceable by review, and eventually by lint. It is the rule that stops
the pattern degrading back into scattered conditionals.

## Consequences

### Positive

- One file per feature. A contributor can add a rib feature without reading the
  rest of the codebase, and two contributors do not conflict.
- Panels, validation, and cache keys are derived rather than repeated.
- The set of features is enumerable at runtime, which makes a command palette,
  a plugin API, and generated documentation all nearly free later.
- Agents and reviewers can locate everything about a feature by its file name.

### Negative / accepted

- A schema layer is indirection, and simple things become slightly less direct.
  Worth it at fifteen features; it would be over-engineering at three, which is
  why this is being decided now, before there are fifteen.
- Generated panels have a ceiling. Some features will need a bespoke editor, so
  the definition must allow overriding the panel, and that escape hatch will get
  abused if it is too easy. Keep it awkward.
- The registry is global mutable state. It must be populated once, at module load,
  and never mutated afterwards.

## Applies equally to

The same pattern, for the same reasons:

- **Sketch tools**, line, rectangle, circle, dimension
- **Exporters and importers**, STEP, STL, 3MF, glTF
- **Constraints**, the solver's typed vocabulary

Each becomes a directory of one-file-per-thing plus a registry. Consistency across
all four is itself a transparency feature: once you have read one, you can find
your way around the others.

## Open questions

- Which schema representation? A hand-rolled minimal one keeps the dependency
  count at zero and the bundle small; something like Zod or Valibot is
  better-known to contributors. Leaning hand-rolled, the schema needs are narrow
  (numbers with units, references, enums) and the canonical-hashing requirement is
  unusual enough that a general library would need wrapping anyway.
- Do plugin-provided features eventually need to register from outside the bundle?
  If so the registry needs a versioned public contract. Not now.
