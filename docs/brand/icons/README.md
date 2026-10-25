# Icons

The new icon set: 57 icons, drawn as code, as thin glass lines on a 16-unit grid. It is the set the
app ships: `scripts/build-app-icons.mjs` turns it into `packages/ui/src/icons/brand-icons.generated.tsx`.
The few icons it does not draw (slot, point, loft, sweep, joint, wrap, align, part, mouse, trackpad)
are still drawn in `packages/ui/src/icons/Icons.tsx`.

| File | What it is |
| --- | --- |
| [`icons.mjs`](icons.mjs) | The drawings, as SVG strings, and the rules they follow (read its header first). `ICONS` maps a key to its drawing, `NAMES` to what the interface calls it. |
| [`glass.mjs`](glass.mjs) | `glassSvg(drawing, { id, size })`: draws one as glass, with the fade, the frosted surfaces, a fine line of light and a soft shadow. Give each icon on a page its own `id`. |
| [`build.mjs`](build.mjs) | Writes `bezier-icons.css` from the drawings: `node docs/brand/icons/build.mjs`. |
| [`bezier-icons.css`](bezier-icons.css) | Generated. `<i class="bi bi-extrude"></i>` takes the text colour and any size. A mask carries only alpha, so it has no line of light; use `glassSvg` for the full look. |

## Notes from moving it into the app

- The [brand guidelines](../Bezier-Brand-Guidelines.pdf) describe icons as filled, with a flat second
  tone and no gradient. These are thin glass lines with a fade, so the guidelines' icon section
  has to change with them.
- The app's own icons are in `packages/ui/src/icons/Icons.tsx`; the rail, the title bar and the
  view panel read from there. Moving to this set means redrawing the keys in `RailContents.tsx`
  and checking each at 20 px on the dark and the light rail.
- The two sets share no drawing. Where the old set had no icon (Extrude used the Tools wrench, Hole
  and Chamfer had none), this one has its own.
