# @bezier/ui

The part users actually judge.

The geometry kernel and the constraint solver are shared with other open-source CAD.
What makes Bezier different is mostly in this package.

At a glance

| | |
| --- | --- |
| **Layer** | React components: the shell, the rail, panels, gizmos, sketch tools, keymaps |
| **Depends on** | `@bezier/core`, `renderer`, `solver` |
| **Used by** | `apps/studio` |
| **Tests** | 18 files, 1,885 lines |
| **Read first** | `src/shell/` (the rail, shortcuts, `keymap-presets.ts` with the ten keymaps), `src/tokens.css` (the design tokens) |


## What "polished" means concretely

It is worth writing down, because "good UX" is not actionable and these are:

- **Sub-millisecond feedback on hover and selection.** Never a frame of hesitation
  before something highlights. This is a rendering and hit-testing budget, not a
  visual style.
- **You can always tell what will happen before you commit.** Live preview of the
  extrude as you drag, of the fillet as you type a radius.
- **Typing a number is as fast as dragging.** Every drag interaction has a
  keyboard equivalent, and the numeric field is already focused.
- **Snapping that guesses right.** To edges, midpoints, centres, and to the values
  a person actually means, 0.5 mm, not 0.4983 mm.
- **Nothing is modal that does not have to be.**
- **Failures are legible.** "This fillet is too big for that edge, try 2 mm" and
  not "BRepFilletAPI_MakeFillet failed".

## Rules

- **No geometry logic here.** If a component computes anything about shape, it
  belongs in `@bezier/core`.
- **Components take data and callbacks.** No direct kernel or solver access.
- **Every interaction is keyboard-reachable and screen-reader-labelled.** Cheap to
  do continuously, expensive to retrofit.

## Status

Started, and structured so the part that can be wrong is testable.

- `param-control.ts`, which control a parameter deserves, and how a typed value
  becomes a stored one. Pure, and where the unit conversions live. Tested.
- `sketch-builder.ts`, what a drawn rectangle actually is. Pure. Tested.
- `PropertyPanel.tsx`, `FeatureTree.tsx`, rendering only.

**The `.tsx` files have no tests.** Deliberate for now: adding jsdom and a
testing library to assert that a `<select>` renders its options buys little,
whereas the decisions underneath, units, bounds, ordering, refusing a bad value
- are pure functions and are covered. That trade stops being right the moment a
component grows behaviour of its own.

