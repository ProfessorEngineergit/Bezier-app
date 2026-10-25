import { define } from '../define.js';

/** The articles of sketching that are about what a drawing means once it is drawn. */
export const SHAPE = [
  define({
    id: 'dimensions',
    title: 'Exact sizes in a sketch',
    area: 'Sketch',
    summary: 'Every line and circle shows its size, and the size can be typed.',
    keywords:
      'dimension size length diameter radius millimetre exact type value snap grid step units inch edit number smart dimension measure',
    body: `A sketch is drawn by eye and then made exact. Every size is a number you can click.

1. Draw a line, a rectangle or a circle. Its size is written beside it, in millimetres.
2. Click the number and type another. Press Enter.
3. Escape leaves the number as it was. Clicking away applies what you typed.

![](image:lengths)

The shape follows the number: a rectangle stays a rectangle, a circle keeps its centre. A circle shows its diameter, marked ⌀. A line shows its length. An arc shows its radius, marked R.

## Draw in steps of a size

To make the pointer land on round numbers, turn on the grid snap.

1. Press Quick settings at the bottom right and choose Units & Grid.
2. Turn on **Snap to grid**.
3. Set the **Grid step**, 1 mm to begin with.

![](image:grid)

New points then land on the grid. A click near an existing point still joins it first, so closed shapes stay closed.

## Units

The same panel has Length (mm, cm, m, in, ft) and Numbers (Decimal or Fractions, for inches and feet).

## Sizes from variables

The sizes on a sketch are plain numbers. A number in a step's own panel, such as the Offset of a sketch or the distance of an extrude, can be an expression that uses a variable. See [variables](doc:variables).

> A size you type while drawing, such as a length for a line or both sides of a rectangle, stays as a dimension afterwards. See [line](doc:line) and [rectangle](doc:rectangle).`,
    shots: {
      lengths: 'A rectangle with its two lengths, each one a field to click',
      grid: 'Units & Grid, with Snap to grid on and its Grid step',
    },
  }),
  define({
    id: 'constraints',
    title: 'Constraints',
    area: 'Sketch',
    summary: 'Say how lines relate: parallel, perpendicular, horizontal, equal, tangent and more.',
    keywords:
      'constraint parallel perpendicular horizontal vertical coincident concentric equal tangent angle lock fix relate geometric relation mate symmetric midpoint collinear point on curve reference driven distance',
    body: `A constraint is a rule about the drawing: these two lines stay parallel, this one stays level. It is how a sketch says what it means, not only where its points are.

1. In a sketch, click a line to pick it. Shift-click to pick a second one.
2. The Constraints bar appears at the bottom of the canvas with the ones that fit what you picked.
3. Click one. A small mark shows on the drawing. Click the mark to take the constraint out again.

![](image:bar)

## What fits what

- **One or more lines**: Horizontal, Vertical, Fix.
- **Two lines**: also Parallel, Perpendicular, Angle and Equal (the same length).
- **Two circles or arcs**: Equal (the same size) and Concentric (the same centre).
- **A line and a circle or arc, or two of them**: Tangent.
- **Two lines**: Collinear, which lays them on one straight, and Ratio, which holds one as a multiple of the other's length. Its mark shows the multiple; click it to type another.
- **Three lines, or two pairs**: Equal angle: the angle from the first to the second stays the one from the second to the third, or the one between the second pair.
- **Any two elements**: Coincident, which brings their nearest ends together.
- **A point and a line**: Point on, Midpoint, and Distance to line. Click right on a line's end to pick the point and not the line.
- **A point and a circle or arc**: Point on.
- **Two points**: Horizontal and Vertical, which level them or stand one above the other, and Distance, Horizontal distance and Vertical distance, each held at what it measures now and written on the drawing to type another.
- **Two points and a line, or three points**: Symmetric, about the line or about the point picked last.
- **A line or circle with a size**: Reference, which keeps its size for reading only. It is shown in brackets and no longer moves the drawing; Reference again makes it drive again.

A button that cannot apply to what you picked is not shown.

## The marks

![](image:marks)

A mark stands beside each constrained line: H for horizontal, V for vertical, ∥ for parallel, ⊥ for perpendicular and so on. A rectangle comes with H and V on its sides already. Click a mark to remove the constraint, and the drawing is free again.

## Angle

Pick two lines and choose Angle. The angle they stand at now is written on the drawing as ∠ and a number in degrees. Click it to type another, between 0 and 180, and press Enter.

## Keys

The keys, in the keymap you use: Parallel {{key:constrain-parallel}}, Perpendicular {{key:constrain-perpendicular}}, Horizontal or vertical, whichever is nearer {{key:constrain-aligned}}, Coincident {{key:constrain-coincident}}, Concentric {{key:constrain-concentric}}, Equal {{key:constrain-equal}}, Tangent {{key:constrain-tangent}}, and Lock, the button called Fix, {{key:constrain-fix}}. Horizontal, Vertical and Angle have no key to begin with; give them one in [Settings, Shortcuts](doc:settings-shortcuts).

## What the sketch says about itself

- The bar at the foot of the canvas counts how much is still free to move, as freedoms left, down to Fully defined.
- Lines, curves and points the constraints hold entirely turn green; blue ones can still move.
- A point drawn on the origin snaps to it and is held there. Without one point held, a sketch can always slide, so it is never fully defined.
- When a change is refused, the marks of the constraints it contradicts turn red, even those that are normally hidden, until the next change is kept.
- A constraint that only restates the others gets a dashed yellow mark. It does no harm, and taking it out keeps the sketch clear.

## What it does

A constraint moves the drawing at once: two lines made parallel turn until they are, and they stay parallel when you drag a point or type a size afterwards. If two constraints cannot both hold, the newer one is refused and the app says which ones disagree.

If the solver cannot be loaded in this window, Bezier says so when it starts: Constraints are kept, not solved yet. They are then stored with the sketch and shown, and take effect the next time the solver is there. Sizes you type move the drawing either way.

If a constraint does not fit what you picked, the bar or the key says why, in words such as Select exactly two lines.

> To round or cut a corner between two lines, see [chamfer or fillet a corner](doc:sketch-corner). To type exact sizes, see [exact sizes](doc:dimensions).`,
    shots: {
      bar: 'Two lines picked, and the constraints that fit them',
      marks: 'Two lines with a Parallel constraint, shown by a mark',
    },
    actions: [
      'constrain-parallel',
      'constrain-perpendicular',
      'constrain-horizontal',
      'constrain-vertical',
      'constrain-aligned',
      'constrain-coincident',
      'constrain-concentric',
      'constrain-equal',
      'constrain-tangent',
      'constrain-angle',
      'constrain-fix',
    ],
  }),
  define({
    id: 'sketch-corner',
    title: 'Chamfer or fillet a corner in a sketch',
    area: 'Sketch',
    summary: 'Cut the corner where two lines meet, or round it.',
    keywords:
      'corner chamfer fillet round bevel sketch two lines size radius cut corner break edge 2d',
    body: `Use this on a corner of the drawing itself, before you extrude. To round an edge of a finished body, see [fillet](doc:fillet).

1. Pick the two lines that meet at the corner: click one, Shift-click the other.
2. In the Constraints bar, type a **Corner size** in millimetres. It starts at 2.
3. Choose **Fillet** for an arc that touches both lines, or **Chamfer** for a straight cut across the corner.

![](image:corner)

![](image:done)

- A **fillet** has the size as its radius. The arc touches both lines smoothly.
- A **chamfer** cuts each line back by the size and closes the gap with a straight line.
- Pressing Enter in the size field makes a fillet.

Undo takes it back and leaves the two lines as they were.

## If it says no

- Select the two lines that meet at the corner. The two lines must share their end.
- A 5 mm fillet does not fit on those lines. The size is longer than the lines allow. Type a smaller one.
- Those lines run straight on. There is no corner when two lines are in one line.

Fillet and Chamfer are buttons only while the two lines you picked meet at a corner.`,
    shots: {
      corner: 'Two lines picked, with Corner size, Fillet and Chamfer in the bar',
      done: 'The same corner after Fillet',
    },
  }),
  define({
    id: 'sketch-areas',
    title: 'Several shapes, holes and areas',
    area: 'Sketch',
    summary: 'How a sketch with more than one shape is read, and what gets extruded.',
    keywords:
      'areas hole inside shape island profile several crossing overlap extrude sketch region nested multiple loops pocket',
    body: `A sketch can hold many shapes. Bezier finds every closed area in it, and you choose which to pull up.

- Two separate shapes in one sketch are two areas, and each is extruded on its own.
- A shape inside another is a hole in it.
- Lines that cross themselves offer each of the areas they enclose.
- A second sketch drawn before the first is extruded leaves both extrudable.

![](image:areas)

## Choose an area

Click the area you want. It is filled, and clicking it offers [Extrude](doc:extrude). Shift-click more areas of the same sketch to extrude them together as one step. Escape takes the offer away.

With nothing clicked, the Extrude command in the rail offers the areas of the newest sketch that have not been used yet.

## When there is no area to click

A shape that is not closed has no area. Its lines may only be close to each other, not joined. Close the gap by drawing to the point, or [trim](doc:trim) the overshoot. Construction lines and [centerlines](doc:centerline) never make an area.

Back to [sketching in five minutes](doc:sketch).`,
    shots: { areas: 'A sketch with a shape inside another, and the outer area clicked' },
  }),
  define({
    id: 'reopen-sketch',
    title: 'Change a sketch afterwards',
    area: 'Sketch',
    summary: 'Open an old sketch, edit it in place, move it off its plane.',
    keywords:
      'edit reopen sketch history change offset plane move later modify redo parametric roll back update drawing',
    body: `A finished sketch is not set in stone. Change it and everything built from it is built again.

## Draw in it again

1. Open Items and double-click the sketch. The sketch tools come back, with the drawing as it was.
2. Change what you want: click a number and type another, draw more, [trim](doc:trim) or [delete](doc:sketch-delete) a line.
3. Press Finish Sketch. The part built from it follows.

![](image:editing)

## Move it off its plane

1. Open Items and click the sketch once. Its numbers open on the right.
2. **Offset** sets how far the sketch stands off its plane, in millimetres. The part built from it moves with it.

![](image:offset)

The same panel shows the sketch's Plane, and the face it stands on under On face, if any. Geometry says it is edited by drawing in the sketch.

The Offset can be an expression that uses a variable. See [variables](doc:variables).

> A sketch that has been built from is not drawn in the model any more, and its row in Items is dimmed. Selecting it brings it back. See [items](doc:items).`,
    shots: {
      editing: 'A sketch reopened from Items, with the sketch tools back in the rail',
      offset: 'A sketch selected in Items, with its Offset',
    },
  }),
  define({
    id: 'finish-sketch',
    title: 'Finish a sketch and what comes next',
    area: 'Sketch',
    summary: 'Leave the sketch and turn what you drew into a part.',
    keywords:
      'finish sketch done enter exit leave extrude area click close accept ok end stop escape',
    body: `1. Press **Finish Sketch**, the top button of the rail, or press Enter.
2. Click inside an area you drew. An arrow and a distance field appear: that is [Extrude](doc:extrude).
3. Type a distance and press Enter. Or press Escape: the offer is taken back and nothing was built.

![](image:button)

The Extrude ⌄ menu beside the field has Direction (Forward, Backward or Symmetric) and Result (New, Add or Cut). If the new part reaches into another body, Bezier asks what to do: Join, Cut from that body, or keep it as a New body. See [extrude](doc:extrude).

## Other ways out

- Press Escape until nothing is left to put down: it cancels a shape you are drawing, puts the tool away, and then leaves the sketch.
- Press Sketch in the rail again.

A sketch with nothing drawn in it is dropped. A sketch with a drawing is kept, as a step in the project. It shows in Items, and you can go back into it. See [change a sketch afterwards](doc:reopen-sketch).

> Several sketches can wait at once. Each keeps its own plane, and every closed area in them can be clicked. See [several shapes, holes and areas](doc:sketch-areas).`,
    shots: { button: 'The Finish Sketch button at the top of the sketch rail' },
  }),
] as const;
