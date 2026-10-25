import { define } from '../define.js';
import { SHAPE } from './sketch-shape.js';

const DRAW = [
  define({
    id: 'sketch',
    title: 'Sketching in five minutes',
    area: 'Sketch',
    summary:
      'The whole path from an empty plane to a solid: draw, relate, size and extrude, with a plate and a hole.',
    keywords:
      'sketch sketching tutorial quick start beginner 2d profile draw dimension constrain extrude workflow first part plate hole overview how',
    body: `A sketch is a flat drawing on a plane or on a face. You draw shapes in it, say how big they are, and pull an area of it into a solid. This page goes the whole way once, with a plate that has a hole in it.

## 1. Start

1. Click **Top** on the orientation cube, top right. The view squares up to the floor.
2. Press **Sketch** in the left rail. The rail turns into the sketch tools, and the plane you are looking at is the one you draw on.

More on planes and faces in [start a sketch](doc:start-a-sketch).

## 2. Draw

1. Press {{key:rectangle}}. Click one corner. Type **60**, press Tab, type **40**, press Enter. The rectangle is 60 by 40 millimetres, toward where the pointer is.
2. Press {{key:circle}}. Click inside the rectangle, move out, click again.
3. Click the number beside the circle and type **12**. Press Enter.

![](image:drawn)

Each tool is in [line](doc:line), [rectangle](doc:rectangle), [circle](doc:circle) and [arc](doc:arc). Escape puts the tool down.

## 3. Relate

A rectangle comes with its sides held horizontal and vertical. For anything else, pick the lines, and the Constraints bar offers what fits: Parallel, Perpendicular, Equal and the rest. See [constraints](doc:constraints).

## 4. Size

Every line and circle shows its size beside it. Click a number, type another and press Enter. Escape leaves a number as it was. See [exact sizes](doc:dimensions).

## 5. Extrude

1. Press **Finish Sketch**, or Enter.
2. Click inside the plate, outside the circle. The circle is a hole in it, so the area you click is the plate and not the disc. An arrow and a distance field appear.
3. Type **8** and press Enter. The plate stands up 8 millimetres, with the hole through it.

![](image:offer)

![](image:result)

Nothing is built until you give a distance. Escape takes the offer away. See [extrude](doc:extrude) for the direction and for adding to or cutting from a body.

## When something goes wrong

- A shape you did not mean: press {{key:undo}}. In a sketch it takes back the last thing drawn. See [undo and redo](doc:undo-redo).
- Nothing happens when you click inside a shape: the lines do not meet. A corner must be shared by two lines, not just close to each other. Draw to the point, or [trim](doc:trim) what overshoots.
- To change the sketch later, double-click it in Items. See [change a sketch afterwards](doc:reopen-sketch).`,
    shots: {
      drawn: 'A 60 by 40 rectangle with a 12 mm circle inside it, in a sketch',
      offer: 'The plate clicked, with the arrow and the distance field of the extrude',
      result: 'The finished plate with its hole',
    },
  }),
  define({
    id: 'start-a-sketch',
    title: 'Start a sketch',
    area: 'Sketch',
    summary: 'Choose a plane, or a face, and draw on it.',
    keywords:
      'sketch start begin plane face draw 2d profile finish plane choose xy xz yz front top right workplane datum new sketch',
    body: `A sketch lives on a flat surface: one of the three planes through the origin, or a flat face of a body.

1. Press **Sketch** in the left rail. The rail turns into the sketch tools.
2. Say where to draw:
   - Click the plane to draw on: the floor, which is XY, or one of the two upright planes, XZ and YZ.
   - Or click a flat face of a body first, then press Sketch. The rail's top button then says On a face.
3. Draw. See [line](doc:line), [rectangle](doc:rectangle), [circle](doc:circle) and [arc](doc:arc).
4. Press **Finish Sketch**, or Enter. The rail comes back.

![](image:planes)

## The short way

- If you are looking along an axis when you press Sketch, for example after clicking Top on the cube, it opens on the plane facing you. No click needed.
- Press a tool's key, such as {{key:line}} or {{key:rectangle}}, outside a sketch. It starts one on the plane you are looking at. If the view is not square to a plane it says Choose a plane to sketch on first, and the tool is in your hand once you have.
- Press Sketch again, while sketching, to finish.

## On a face

![](image:face)

Only a flat face can be sketched on. A curved face says so. A sketch on a face follows it: if the face moves when you change an earlier step, the sketch moves with it. To bring the outline of the face into the sketch, see [project the edges of a face](doc:project-edges).

## A plane at an angle

Once a plane or face is chosen, a bar at the foot of the canvas holds three numbers for it: **Offset** moves it along its normal, **Tilt** turns it about its own horizontal axis and **Turn** about its upright one. XY tilted by 45 is a plane halfway between the floor and a wall. The grid lies on the plane you draw on, at whatever angle, so its cells are the ones snapping counts. The numbers are kept with the sketch and can be changed later in its bar.

## Every sketch is its own

Pressing Sketch always starts a new sketch. It does not go back into the last one. To draw in an old sketch, double-click it in Items. See [change a sketch afterwards](doc:reopen-sketch).

> The button at the top of the sketch rail reads Finish Sketch, and under it says which plane you are on: XY plane, On a face, or No active plane while you have not chosen one. An empty sketch is dropped when you leave it.

Back to [sketching in five minutes](doc:sketch).`,
    shots: {
      planes: 'The sketch tools in the rail, and the three planes to draw on',
      face: 'A sketch started on the top face of a block',
    },
    features: ['sketch'],
    places: ['sketch-mode'],
  }),
  define({
    id: 'line',
    title: 'Line',
    area: 'Sketch',
    summary:
      'Draw straight lines one after another; a chain that closes becomes an area to extrude.',
    keywords:
      'line polyline segment draw sketch chain close dimension length straight edge angle snap',
    body: `1. In a sketch, press {{key:line}}, or choose Line in the rail.
2. Click for each point. Each click starts the next line where the last one ended.
3. To close a shape, click the first point again. The lines join there, and the area fills in.
4. Press Escape to end the chain. Press it again to put the line tool down, and a third time to leave the sketch.
5. Click the length beside a line to type an exact size in millimetres, then press Enter.

![](image:chain)

## Type a length as you draw

While a line is stretching from the last point, type digits: 50 makes it 50 mm long. The pointer still decides the direction. Press Enter to place it, or click. Backspace takes the last digit away.

## Joining

A click within a millimetre or two of an existing point reuses that point, so the lines are joined and not just touching. That is what makes a closed shape: a shape whose corners are only close is not closed, and cannot be extruded. If Snap to grid is on, free clicks land on the grid. See [exact sizes](doc:dimensions).

A chain that closes is an area, and clicking inside it goes straight on to [Extrude](doc:extrude). For a line that guides and does not shape, see [centerline](doc:centerline) and [construction](doc:construction).`,
    shots: { chain: 'A triangle of three lines, closed, with their lengths' },
    actions: ['line'],
  }),
  define({
    id: 'rectangle',
    title: 'Rectangle',
    area: 'Sketch',
    summary: 'Draw a rectangle from corner to corner or from its centre.',
    keywords:
      'rectangle box square sketch draw profile corner centre center diagonal two point width height rect',
    body: `1. In a sketch, press {{key:rectangle}}, or choose Rectangle in the rail.
2. Choose how: **Diagonal** is corner to corner, **Center** is centre to corner. Open the choice with the small mark on the Rectangle button, or press the key again to switch between them.
3. Click once to start and once more to set the size.

![](image:variants)

## Type the size

After the first click, and without moving the pointer, type the length, press Tab, and type the width. Enter places the rectangle. Tab goes back and forth between the two, and Backspace takes a digit away.

![](image:typed)

The sizes you type stay as dimensions on the sides, and you can change them later: click a number and type another. See [exact sizes](doc:dimensions).

## What you get

A rectangle is four lines with their corners joined, two sides held horizontal and two held vertical. It stays a rectangle when you change a width. Because the corners are shared, it is a closed area at once.

Press Finish Sketch. Clicking inside the rectangle then goes straight on to [Extrude](doc:extrude). A rectangle drawn inside another is a hole in it. See [several shapes, holes and areas](doc:sketch-areas).`,
    shots: {
      variants: 'The two kinds of rectangle in the rail',
      typed: 'A rectangle being drawn with its length typed in',
    },
    actions: ['rectangle'],
  }),
  define({
    id: 'circle',
    title: 'Circle',
    area: 'Sketch',
    summary: 'Draw a circle from its centre, and set its diameter.',
    keywords: 'circle round diameter radius hole sketch draw disc cylinder ellipse centre center',
    body: `1. In a sketch, press {{key:circle}}, or choose Circle in the rail.
2. Click the centre, then move out. The diameter shows beside the pointer, with the sign ⌀.
3. Click to set it.

![](image:diameter)

## Set the size

A circle stays editable. Click its diameter at any time, type another and press Enter.

You can also type while you draw: after the centre click, type a number and press Enter. The number is taken as the **radius**, in millimetres, while the label shows the diameter. Typing 20 gives a circle marked ⌀ 40. If you want to be sure of a diameter, draw the circle and then click the number beside it and type the diameter.

## Through three points

Circle's 3-point variant, beside Center in the rail, draws the circle through three clicks. Clicks on points already there stay on the circle.

## A circle inside a shape

A circle drawn inside a closed shape is a hole in it. Click the area around it to extrude the shape with the hole. See [several shapes, holes and areas](doc:sketch-areas). A circle alone is an area too: extruding it makes a cylinder.

A circle can be turned into a guide: see [construction](doc:construction).`,
    shots: { diameter: 'A circle with its diameter, ⌀, written beside it' },
    actions: ['circle'],
  }),
  define({
    id: 'arc',
    title: 'Arc',
    area: 'Sketch',
    summary: 'Draw a curved segment between two points.',
    keywords: 'arc curve radius bend round sketch draw three point fillet curved side',
    body: `1. In a sketch, press {{key:arc}}, or choose Arc in the rail.
2. Click the two ends of the arc.
3. Move to bend it. The radius shows, marked with R.
4. Click to set it.

![](image:arc)

An arc that closes against a line makes an area with a curved side, and extrudes as an exact curve.

## Joining

An end of an arc that you click near an existing point joins it, as a line does, so a line and an arc can close a shape. Click on the ends of a line you have drawn and the arc is built on it, as in the picture.

## From its centre, or along a line

Arc has three variants in the rail. **3-point** is the one above. **Center**: click the centre, then where the arc starts, then which way round to where it ends. **Tangent**: click the end of a line, then where the arc ends; it leaves the line along it and stays tangent to it.

## Rounding a corner instead

To round a corner between two lines that you have already drawn, use Fillet in the Constraints bar, not an arc. See [chamfer or fillet a corner](doc:sketch-corner).`,
    shots: { arc: 'A line, and an arc being bent between its ends, with its radius R' },
    actions: ['arc'],
  }),
  define({
    id: 'trim',
    title: 'Trim',
    area: 'Sketch',
    summary: 'Cut away the part of a line that reaches past where it should stop.',
    keywords:
      'trim cut extend overdrawn remove remainder sketch clean overshoot break split divide',
    body: `Trim is for the line you drew a little too long. It removes the part that sticks out, up to the line it crosses.

1. Draw lines that cross, so that one reaches past the shape.
2. Press {{key:trim}}. Trim is lit in the rail.
3. Click the part that sticks out. It is removed up to the line it crosses.

![](image:before)

![](image:after)

Trim both ends of an overlong closing line and the shape is closed, with nothing left over.

## Extend and split

Trim has two more variants in the rail. **Extend**: click near the end of a line and it grows to the first line, circle or arc ahead of it; only a free end grows. **Split**: click along a line and it is cut in two there, the halves sharing the new point.

## Good to know

- Click the part you want gone, not the part you want to keep.
- Press Escape to put Trim down. To undo a trim, press {{key:undo}}.
- To remove a whole line, pick it and use [delete](doc:sketch-delete).`,
    shots: {
      before: 'Trim on, with a line reaching past the shape',
      after: 'The same sketch after the overshoot was clicked',
    },
    actions: ['trim'],
  }),
  define({
    id: 'centerline',
    title: 'Centerline',
    area: 'Sketch',
    summary: 'A line to measure and align against, that is never part of a shape.',
    keywords:
      'centerline centreline axis helper guide construction symmetry mirror axis dashed reference',
    body: `A centerline is a guide. It is not part of any shape, and it is never extruded.

1. In a sketch, choose Centerline in the rail.
2. Click its points as you would for a line.

![](image:drawn)

A closed chain of centerlines encloses no area, so there is nothing to extrude. It is there to draw against: to snap to, to measure from, to hold a symmetry.

Centerline is the Line tool, drawing in construction. A centerline looks the same as any construction line, dashed. Press Escape to put the tool down.

> To turn a line you already drew into a guide, see [construction](doc:construction).`,
    shots: { drawn: 'A rectangle with a centerline drawn through it' },
    places: ['centerline'],
  }),
  define({
    id: 'construction',
    title: 'Construction',
    area: 'Sketch',
    summary: 'Turn a line into a guide, drawn dashed, that shapes nothing.',
    keywords:
      'construction guide dashed helper toggle reference line geometry non-printing switch normal',
    body: `1. In a sketch, click a line to pick it. Shift-click to pick more.
2. Choose Construction in the rail.

The line is drawn dashed from then on, and it no longer takes part in any shape. A side of a rectangle that you switch to construction opens the rectangle, so it no longer encloses an area.

![](image:dashed)

Choose Construction again on the same lines to turn them back into ordinary lines. With a mix of both picked, they all become construction first.

It works on arcs and circles too, for a circle that only places the holes on.

See also [centerline](doc:centerline), which draws guides from the start.`,
    shots: { dashed: 'The top side of a rectangle, switched to construction' },
    places: ['construction'],
  }),
  define({
    id: 'project-edges',
    title: 'Project the edges of a face',
    area: 'Sketch',
    summary: 'Bring the outline of a face into the sketch you are drawing on it.',
    keywords:
      'project edges face outline copy sketch reuse trace convert entities offset silhouette boundary',
    body: `Use this to build on something that exists: a boss on a face, a pocket inside its outline.

1. Click a face of a body.
2. Press Sketch. The rail says it is on a face.
3. Choose Project. The edges of the face are in the sketch.
4. Press Finish Sketch, then click inside the outline to [extrude](doc:extrude) it.

![](image:projected)

The edges come in as ordinary lines, arcs and circles that you can [trim](doc:trim), [delete](doc:sketch-delete) or draw against.

## If it says to start on a face

Project works only while the sketch is on a face. On a plane it says: Project brings in the edges of the face a sketch is drawn on. Start the sketch on a face. Press Escape, pick the face, and press Sketch again.

## Where a part meets the plane

**Intersection**, below Project in the rail, works on any plane: it brings in the outline the parts have where they cross the plane you are drawing on, at whatever angle or offset it stands. A plane that reaches no part says so.

> Start a sketch on a face as in [start a sketch](doc:start-a-sketch).`,
    shots: { projected: 'The top face of a block, projected into a sketch on it' },
    places: ['project', 'sketch-intersection'],
  }),
  define({
    id: 'sketch-delete',
    title: 'Delete in a sketch',
    area: 'Sketch',
    summary: 'Remove one line, arc or circle and leave the rest.',
    keywords: 'delete remove erase sketch line primitive clear backspace cut away',
    body: `1. Click the line, arc or circle. It is picked.
2. Choose Delete in the rail, or press {{key:delete}}.

![](image:picked)

Only that one piece goes. The rest of the sketch stays as it was. A picked point takes the lines and curves that end on it along. Points that nothing uses any more go too, and so do the constraints that named the piece.

Shift-click to pick several first. To take back a delete, press {{key:undo}}.

> To remove a part of a line and not the whole line, use [trim](doc:trim).`,
    shots: { picked: 'A line picked, and Delete in the rail' },
    places: ['sketch-delete'],
  }),
  define({
    id: 'sketch-shapes',
    title: 'Polygon, slot and point',
    area: 'Sketch',
    summary: 'Draw a regular polygon, a slot with round ends, or a single point.',
    keywords:
      'polygon hexagon triangle pentagon octagon regular slot oblong rounded slot keyway point dot vertex sketch shape',
    body: `## Polygon

1. In a sketch, choose Polygon in the rail. It starts as a hexagon; Triangle, Pentagon and Octagon are beside it.
2. Click the centre.
3. Click where one corner goes. The polygon is drawn round a dashed circle through its corners.

Its sides stay equal and its corners stay on that circle, so typing one side's length sizes the whole polygon.

## Slot

1. Choose Slot in the rail.
2. Click the centres of its two round ends.
3. Click beside them to set how wide it is.

The straight sides stay tangent to both ends, and the two ends stay one size.

## Point

Choose Point and click. A point on its own is something to measure from, mirror about or turn a pattern round; it is never part of an area.`,
    places: ['polygon', 'slot', 'point'],
  }),
  define({
    id: 'sketch-curves',
    title: 'Spline, ellipse and text',
    area: 'Sketch',
    summary: 'Draw a smooth curve through points, an ellipse, or letters to extrude.',
    keywords:
      'spline curve smooth bezier freeform organic ellipse oval text letters lettering font engrave emboss label sketch',
    body: `## Spline

1. Choose Spline in the rail.
2. Click the points the curve should run through, in order.
3. Click the first point again to close it, or press Enter or Escape to end it where it is.

The points are ordinary points: drag them to reshape the curve, snap other lines to them, size the distances between them. A closed spline, or one closed by lines, is an area to extrude, and the solid has exactly the curve you see.

## Ellipse

Ellipse is a variant of Circle in the rail. Click its centre, then the end of one axis (which also sets its turn), then beside that axis for how wide it is.

## Text

1. Choose Text in the rail.
2. Type the text, its height in millimetres from the baseline to the top of a capital, and where its baseline starts.
3. Press Done.

The letters, set in Archivo, become lines and curves like anything you draw: each letter is an area to extrude, raised for embossing or cut away for engraving. Move them afterwards with [Modify, Transform](doc:sketch-modify).`,
    places: ['spline', 'ellipse', 'sketch-text'],
  }),
  define({
    id: 'sketch-modify',
    title: 'Offset, mirror, pattern and transform',
    area: 'Sketch',
    summary: 'Copy what is picked beside itself, mirror it, repeat it, or move, turn and scale it.',
    keywords:
      'offset parallel copy mirror symmetric reflect pattern array repeat linear polar circular rotate move scale transform sketch modify',
    body: `Pick the lines, circles or arcs to change (Shift-click for more than one), then choose Modify in the rail. A bar opens at the foot of the canvas; Done keeps the change, Escape or Cancel drops it.

- **Offset**: a copy that stands the given distance off. Joined lines stay joined at their corners. A positive distance goes to the left of a line's direction and outward from a circle or arc.
- **Mirror**: pick what to mirror and last the line to mirror it about. The copy is held symmetric to the original, so it follows when the original changes.
- **Pattern**: Linear repeats along a step in X and Y; Polar turns the copies round the point picked last, or round the sketch's origin without one. Count counts the original.
- **Transform**: moves the picked elements by X and Y, turns them round their middle and scales them.`,
    places: ['sketch-modify'],
  }),
  ...SHAPE,
] as const;

export const SKETCH = DRAW;
