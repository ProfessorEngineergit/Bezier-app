# Brand

**Name: Bezier.** Decided 2026-08-05.

## Why Bezier

Pierre Bézier developed the curve at **Renault, to describe car bodies**. It was
not a graphics technique that later found its way into engineering, it was
invented *for* engineering, and computer-aided design grew out of it.

Every surface our kernel evaluates is built from that mathematics. The name is
not a metaphor for what the product does; it is the thing the product is made of.

It is also the most recognisable diagram in the field: a curve, two anchors, two
handles. Anyone who has designed anything on a computer knows it on sight, and
everyone else sees an elegant mark.

## The assets

| File | Use |
| --- | --- |
| [`logo/bezier-app-icon-dark.png`](logo/bezier-app-icon-dark.png) | The mark: the silver B with the glass cube on a near-black plate, 1024 px. App icon on every platform (`pnpm --filter @bezier/desktop icons` makes the rest from it), website mark, loader. |
| [`logo/bezier-app-icon-light.png`](logo/bezier-app-icon-light.png) | The same mark for a light ground: the graphite B with the glass cube on a white plate, 1024 px. Shown wherever the interface is in its light scheme. |
| [`icons/`](icons/README.md) | The new icon set as code: 57 thin glass icons, a glass renderer and a generated stylesheet. Not in the app yet. |

| [`icons/`](icons/README.md) | The new icon set as code: 53 thin glass icons, a glass renderer and a generated stylesheet. Not in the app yet. |

The web app's own copies are `apps/studio/public/favicon.png`,
`apps/studio/public/brand/bezier-dark.png` and `apps/studio/public/brand/bezier-light.png`.

The earlier curve mark (a Bézier curve with handles, in cyan and violet glass)
is retired; the section below describes that mark.

## The material

The glass marks are built the way real glass behaves, in layers:

1. **Light bleed**, a blurred colour copy underneath. Without it the mark reads
   as flat coloured line art instead of something lit.
2. **Chromatic fringing**, cyan and magenta copies offset by four units. Glass
   splits light, so its edges disagree slightly about where they are. Kept very
   low; more than this and it reads as a printing error.
3. **The body**, a gradient that runs cool white at the top-left to violet at the
   bottom-right, through a specular-lighting filter. That temperature shift is
   what makes a transparent thing read as a *material* rather than an outline.
4. **Rim light** on the faces turned toward the source.

Light comes from **above and to the left** in every asset. If you add one, match
it, inconsistent light direction is the fastest way to make a set of marks look
amateur.

### Palette

| | |
| --- | --- |
| Highlight | `#F2F9FF` |
| Cool | `#A8DCFF` → `#4FD8FF` |
| Core | `#6C8CFF` |
| Warm edge | `#9B7BFF` → `#D46BFF` |
| Plate | `#232A52` → `#07080F` |

## Rules

- **Do not re-colour the glass mark.** It is a material, not a shape. Recolouring
  it breaks the lighting model. If you need a different colour, use the flat mark.
- **The flat mark inherits `currentColor` when inlined.** Its built-in
  light/dark defaults only apply when it is loaded as a standalone file.
- **The handles are expendable.** Below roughly 24 px the dashed control lines
  drop out and the mark still works, curve plus two anchors carries it.
- **Clear space:** at least the radius of an anchor point on every side.
- **Never stretch.** Scale uniformly.

## Still to do

- PNG exports at 16/32/128/256/512/1024 for platforms that will not take SVG
- `.icns` and `.ico` for the desktop builds (ADR 0006)
- A wordmark, the mark currently has no typographic partner. Needs a typeface
  decision first.
- Social card and Open Graph image
- Monochrome one-colour variant for single-colour printing
