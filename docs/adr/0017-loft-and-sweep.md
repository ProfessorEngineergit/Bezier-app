# ADR 0017: Loft and Sweep build from sketches, and name their faces as extrude does

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

The audit (F-032, F-033) found no Sweep and no Loft, both of which every parametric
modeller offer: a handle swept along a bent path, a transition from a round to a square section. The
kernel has both (`occt-wasm` `loft`, `sweepOriented`); what was missing was how a feature names its
inputs and its faces, which is a compatibility promise (the face tags are written into documents).

## Decision

**Loft** takes two sketches (`from`, `to`), each with one closed area, optionally ruled (straight
sides instead of a smooth skin), and makes a solid between them, new or added to or cut from the
body like an extrude. Its faces are tagged `start`, `end` and `side-*`, the tags an extrude uses, so
a fillet on a loft's side reads like one on an extrude's.

**Sweep** takes a profile sketch with one closed area and a path sketch whose lines, arcs and
splines join end to end into one open or closed chain. The profile is carried along the path
keeping its angle to it. Same tags: `start`, `end`, `side-*`.

Both read their sketches through `RebuildInput` (`profiles`, and `path` for the chain), so the solver
stays out of the feature, as for extrude (ADR 0008). The path is chained in `@bezier/core`; the
kernel only builds edges from exact segments, as it already does for profiles.

## Consequences

A path that branches, or does not join, is refused with that said, not guessed at. Lofting through
more than two sections, guide rails and twisting are not part of this; each would be a parameter
added later with a default that keeps saved documents building as they did.
