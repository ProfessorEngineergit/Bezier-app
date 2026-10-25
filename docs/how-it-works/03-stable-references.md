# 3 · Names that survive a rebuild

You extrude a sketch and round one edge. Later you change the sketch from 40 mm to
50 mm. The engine rebuilds everything from scratch and returns a solid whose internal
numbering has nothing to do with the last one. Edge 7 is somewhere else now. **Which
edge did you mean?** This is the *topological naming problem*; it is why other CAD
programs have a long history of "my model exploded when I changed a dimension". It is
what `@bezier/core` exists to solve, and it is the product.

## Name geometry by what made it, not where it is

| Thing | Named by | Written as |
| --- | --- | --- |
| A **face** | the feature that produced it and a tag | `F:extrude-1:side-2` |
| An **edge** | the two faces it lies between | `E(F:extrude-1:end\|F:extrude-1:side-2)` |
| A **vertex** | the set of faces meeting at it | `V(F:extrude-1:end\|F:extrude-1:side-1\|F:extrude-1:side-2)` |

Deriving edges and vertices from faces is forced, not chosen: OCCT reports how an
operation changed **faces** only. An edge that has been rounded is still "the seam
between those two faces", wherever the rebuild put it.

## How the names are carried through a rebuild

Each kernel operation reports what it did: which faces it **modified**, **generated** and
**deleted** (`EvolutionData`). Rebuilding from the first feature to the last means
following that report step by step, so a name given in step 2 still resolves in step 4.
Two details from the real engine, found by experiment and worked around in
`packages/kernel/src/occt-kernel.ts`:

- the "modified" list is a flat run of `[inputHash, count, ...newHashes]`, not a list of hashes;
- the "generated" list comes back empty for fillets, and is recovered by subtraction.

If a feature refers to a face that no longer exists after the change, it is not rounded
somewhere random: it is marked **dangling** and tells you which reference it lost
(`FeatureStatus` in `packages/core/src/features/types.ts`).

## Why not the obvious ways

Both were tried (`tools/spikes/face-hash-stability.ts`, recorded in [ADR 0001](../adr/0001-geometry-kernel.md)):

| Idea | Result |
| --- | --- |
| Use the kernel's face hashes | An identical rebuild in the same session preserves **0 of 6**. They are valid inside one rebuild pass and must never be written down. |
| Recognise the face by its shape | Widening a box leaves only **1 of 6** faces geometrically unchanged. A signature is a tie-breaker between siblings, never an identity. |

What is left is provenance, and that is what the scheme above is built on.

## A compatibility promise

The text form (`F:extrude-1:side-2`) is **written into saved documents**, and so are the
tags a feature declares for its faces. Changing either breaks every file anyone has
saved. The format lives in `packages/core/src/stable-ref.ts` and its tests encode real
decisions; read them before changing anything there.

## Where it shows in the app

- Clicking a face returns a reference, never a triangle number (a triangle number means
  nothing once the model rebuilds), [page 5](05-viewport.md).
- A simulation names the faces it fixes and loads by reference, so the setup survives a
  re-mesh and most model edits, [page 7](07-simulation-and-lessons.md).
- The Settings option *Show selected references* shows the name of what you picked.
