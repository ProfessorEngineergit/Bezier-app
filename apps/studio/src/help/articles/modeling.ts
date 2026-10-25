import { define } from '../define.js';

export const MODELING = [
  define({
    id: 'extrude',
    title: 'Extrude',
    area: 'Modeling',
    summary: 'Pull a closed sketch area, or a face, into a solid, or push it into one to cut.',
    keywords:
      'extrude pull push pad boss cut height depth solid body distance direction symmetric new add',
    body: `## From a sketch

1. Draw a closed shape in a [sketch](doc:start-a-sketch) and finish it.
2. Click inside the shape, or choose Extrude under Tools, or press {{key:extrude}}. An arrow and a distance field appear.
3. Drag the arrow or type a distance.
4. Press Enter. The step is added to the history.

![](image:gizmo)

Nothing is built until a distance is given. Escape takes the arrow away again.

## Options

Press **Extrude ⌄** beside the field.

- **Direction**: Forward, Backward or Symmetric about the sketch.
- **Result**: a New body, or added to a body, or cut from one.

![](image:options)

## From a face

Select a face of a body and drag its arrow. A positive distance adds material; a negative one cuts, and the sign is the only choice there is. The part is drawn live as you drag.

> When the new part runs into another, Bezier asks whether to join it, cut it from the other, or keep it apart.`,
    shots: {
      gizmo: 'The arrow and distance field on a rectangle',
      options: 'The options of the extrude',
    },
    actions: ['extrude'],
    features: ['extrude', 'face-extrude'],
  }),
  define({
    id: 'fillet',
    title: 'Fillet and chamfer',
    area: 'Modeling',
    summary: 'Round an edge, or cut it at an angle.',
    keywords: 'fillet chamfer round bevel edge radius blend corner smooth cut',
    body: `1. Click an edge of a body. A handle appears on it.
2. Drag the handle away from the edge for a round, or push it back through the edge for a bevel. Or click the value and type a size, then press Enter.
3. The shape follows while you drag; it is built when you let go.

![](image:handle)

## Fillet or chamfer

The menu beside the value switches the same handle between Fillet and Chamfer. Closing the menu changes nothing.

![](image:menu)

## Change it later

- Click a rounded face to reopen its radius. A radius of zero removes the fillet.
- Click several edges to round them together.

> A fillet keeps the edge it was given when an earlier step changes, such as the height of the body. That is how Bezier names edges; see how history stays right.`,
    shots: {
      handle: 'The handle on an edge, with its value',
      menu: 'The menu that switches between Fillet and Chamfer',
    },
    actions: ['fillet'],
    features: ['fillet', 'chamfer'],
  }),
  define({
    id: 'shell',
    title: 'Shell',
    area: 'Modeling',
    summary: 'Hollow a body out, leaving walls of an even thickness and the faces you chose open.',
    keywords: 'shell hollow wall thickness open face hollow out',
    body: `1. Click the face, or faces, to leave open. Hold Shift for more than one.
2. Choose Shell under Tools, or press {{key:shell}}. The body is hollowed with walls of 2 mm.
3. Open Items, click Shell, and change **Thickness**.

![](image:inspector)

If nothing is selected, Bezier says to select at least one face.`,
    shots: { inspector: 'The Shell step in Items, with its Thickness' },
    actions: ['shell'],
    features: ['shell'],
  }),
  define({
    id: 'hole',
    title: 'Hole',
    area: 'Modeling',
    summary: 'Drill a hole into a face: plain, counterbored or countersunk.',
    keywords: 'hole drill bore counterbore countersink diameter depth through screw',
    body: `1. Choose Hole under Tools, then click the face to drill. The hole is made where you click.
2. Open Items, click Hole, and set what it is:

- **Diameter** and **Depth**, or **Through all**.
- **Style**: Simple, Counterbore or Countersink. A counterbore adds a head diameter and depth; a countersink adds an angle.
- **X** and **Y** move it on the face.

![](image:inspector)

Without a face, Bezier says what to click.

## An existing hole

Click the wall of a hole that is already there, for instance in an imported part, and type another radius. It stays editable afterwards.`,
    shots: { inspector: 'The Hole step in Items, with its style and diameter' },
    actions: ['hole'],
    features: ['hole', 'cylinder-radius'],
  }),
  define({
    id: 'revolve',
    title: 'Revolve',
    area: 'Modeling',
    summary: 'Turn a sketch around an axis to make a round part.',
    keywords: 'revolve spin lathe turn axis round rotate profile angle bottle',
    body: `1. Draw a closed shape in a [sketch](doc:start-a-sketch) and finish it.
2. Choose Revolve under Tools, or press {{key:revolve}}. The shape is turned through a full circle.
3. In Items, click Revolve to change the **Axis** (the sketch's own horizontal or vertical), the **Angle**, and the **Result**: a new body, added to one, or cut from one.

![](image:inspector)

Without a closed shape, Bezier says to draw one first.`,
    shots: { inspector: 'The Revolve step in Items, with Axis, Angle and Result' },
    actions: ['revolve'],
    features: ['revolve'],
  }),
  define({
    id: 'combine',
    title: 'Combine: union, subtract, intersect',
    area: 'Modeling',
    summary: 'Join bodies into one, cut one from another, or keep only where they overlap.',
    keywords: 'combine boolean union subtract intersect join cut merge bodies overlap difference',
    body: `1. Pick two bodies: the one to keep first, then Shift-click the other. In Items, click one body row and Shift-click the second.
2. Choose Combine under Tools, or press {{key:union}}. The step starts as a join.
3. In Items, click the step. **Operation** is Join, Cut or Intersect, and **Keep tools** keeps the second body.

The keys for the three: Union {{key:union}}, Subtract {{key:subtract}}, Intersect {{key:intersect}}.

![](image:inspector)

With fewer than two bodies picked, Bezier says: Select two bodies.`,
    shots: { inspector: 'The Combine step in Items, with its Operation' },
    actions: ['union', 'subtract', 'intersect'],
    features: ['combine'],
  }),
  define({
    id: 'split',
    title: 'Split',
    area: 'Modeling',
    summary: 'Cut a body in two with a plane, or along one of its own faces.',
    keywords: 'split cut divide plane two halves lid separate section body',
    body: `1. Pick the body.
2. Press {{key:split}}. The body is cut in two along the XY plane, and the two halves are bodies of their own.
3. In Items, click Split. Choose the **Plane** (XY, XZ or YZ), the **Offset** from it, and a **Tilt** about X or Y.

![](image:inspector)

## Along a face

Pick the body, then Shift-click the face to split along, and press the key. This takes a lid off a part.`,
    shots: { inspector: 'The Split step, with its plane and offset' },
    actions: ['split'],
    features: ['split-body'],
  }),
  define({
    id: 'move-rotate',
    title: 'Move and rotate',
    area: 'Modeling',
    summary:
      'Move a body along an axis or turn it about one, by dragging or by typing exact numbers.',
    keywords:
      'move rotate translate turn position gizmo copy offset pivot arrow axis distance angle',
    body: `1. Double-click a body to pick all of it, or pick it in Items. Press {{key:move-rotate}}.
2. A gizmo appears on it. Drag an arrow to move along that axis; drag a ring to turn about it. Or click an arrow, and type the distance or angle.
3. **Copy** leaves the original in place and moves a copy.
4. Press Done.

![](image:gizmo)

- The centre handle moves the pivot the rotation turns about, without changing the model.
- Escape while dragging cancels, and nothing is written.
- With several bodies and nothing picked, Bezier asks which one to move.

**One face or one edge.** Click a face or an edge on its own and press {{key:move-rotate}}: only that face or edge moves, and the faces beside it follow. Raising one top edge tilts the top and the sides that meet it. A move that would bend a face, or a curved face next to it, is refused with the reason, and nothing is written. To move the whole body, double-click it.

Each move, copy or turn is a step in the history and can be undone.`,
    shots: { gizmo: 'The move and rotate gizmo on a body' },
    actions: ['move-rotate'],
    features: ['move', 'move-parts', 'rotate', 'transform-copy'],
  }),
  define({
    id: 'scale',
    title: 'Scale',
    area: 'Modeling',
    summary: 'Make a body larger or smaller by a factor.',
    keywords: 'scale resize grow shrink factor size enlarge reduce',
    body: `1. Pick the body.
2. Choose Scale under Transform, or press {{key:scale}}.
3. In Items, click Scale and type a **Factor**: 2 doubles it, 0.5 halves it.

![](image:inspector)`,
    shots: { inspector: 'The Scale step with its Factor' },
    actions: ['scale'],
    features: ['scale'],
  }),
  define({
    id: 'mirror',
    title: 'Mirror',
    area: 'Modeling',
    summary: 'Add a mirrored copy of a body across a plane.',
    keywords: 'mirror reflect symmetric copy flip plane',
    body: `1. Pick the body.
2. Choose Mirror under Transform. A mirrored body is added beside it.
3. In Items, click Mirror to choose the **Plane** (YZ, XZ or XY), an **Offset**, and whether to **Keep original**.

![](image:inspector)`,
    shots: { inspector: 'The Mirror step and the two bodies it made' },
    actions: ['mirror'],
    features: ['mirror'],
  }),
  define({
    id: 'align',
    title: 'Align',
    area: 'Modeling',
    summary: 'Set one body against another, face to face.',
    keywords: 'align mate place against contact face to face snap position flush',
    body: `1. Click a flat face of the body to move.
2. Shift-click the flat face of the other body to set it against.
3. Choose Align under Transform. The body turns until its face looks at the other and slides until their middles meet.
4. In Items, click Align for a **Gap** between the faces, or **Same direction** to have both faces look the same way.

The step keeps both faces, so when the other body moves or grows, the aligned one follows.`,
    actions: ['align'],
    features: ['align'],
  }),
  define({
    id: 'loft',
    title: 'Loft',
    area: 'Modeling',
    summary: 'A solid that runs from one sketched shape to another.',
    keywords: 'loft blend transition skin sections round to square taper',
    body: `1. Draw a closed shape in one sketch, and another in a second sketch on a parallel plane (use the plane's **Offset**), or a leaning one.
2. Choose Loft under Tools. The two latest sketches with one closed shape each are joined; a sketch picked in Items is used first.
3. In Items, click Loft to choose **From sketch** and **To sketch**, **Straight sides** for flat faces between the sections, and the **Result**: a new body, added to one, or cut from it.`,
    actions: ['loft'],
    features: ['loft'],
  }),
  define({
    id: 'sweep',
    title: 'Sweep',
    area: 'Modeling',
    summary: 'Carry a sketched shape along a path: a pipe, a handle, a rail.',
    keywords: 'sweep path pipe tube handle rail along follow',
    body: `1. Draw the path as lines, arcs or a spline joined end to end, in a sketch of its own. Leave it open, or close it into a loop.
2. Draw the shape to carry in another sketch, standing across the start of the path.
3. Choose Sweep under Tools. The latest closed shape is carried along the latest open path.
4. In Items, click Sweep to change the **Profile sketch**, the **Path sketch** or the **Result**.

A path that branches, or whose pieces do not join, is refused and says so.`,
    actions: ['sweep'],
    features: ['sweep'],
  }),
  define({
    id: 'wrap',
    title: 'Wrap',
    area: 'Modeling',
    summary: 'Lay text or a shape round a cylinder, raised from it or cut into it.',
    keywords: 'wrap emboss engrave text logo cylinder round label deboss raised',
    body: `1. Draw the text or shape in a sketch on a plane beside the round face, for example the XZ plane moved out with **Offset**.
2. Pick the round face.
3. Choose Wrap under Tools. The shapes are laid round the face as long as they were drawn, standing 1 mm proud.
4. In Items, click Wrap to set the **Height**: positive raises it, negative cuts it in.

A shape wider than a quarter of the way round is refused; make it smaller or the face larger.`,
    actions: ['wrap'],
    features: ['wrap'],
  }),
  define({
    id: 'joint',
    title: 'Joint',
    area: 'Modeling',
    summary: 'Let one part turn or slide on another, between limits.',
    keywords: 'joint hinge revolute slider assembly mate move limits rotate slide',
    body: `1. Click a face of the part that moves.
2. Shift-click the face it moves on: a round face turns it about its axis, a flat face about the line through its middle, or slides it along that line.
3. Choose Joint under Transform.
4. In Items, click Joint for the **Kind** (revolute to turn, slider to slide), the **Angle** or **Distance**, and the least and most it may go. A value past a limit stops at the limit.

The joint holds on to the face: when the other part moves, the joined one goes with it.

To list the parts and how many of each there are, use Export > **Bill of materials**.`,
    actions: ['joint'],
    features: ['joint'],
  }),
  define({
    id: 'pattern',
    title: 'Pattern',
    area: 'Modeling',
    summary: 'Repeat a body in a line or around an axis.',
    keywords: 'pattern array repeat linear circular copies count step spread',
    body: `1. Pick the body.
2. Choose Pattern under Transform. Copies are made at once.
3. In Items, click Pattern. Set the **Count**, choose **Linear** or **Circular** as the arrangement, and its **Step** in X, Y and Z, or the **Axis** and the **Spread** in degrees for a circle.

![](image:inspector)

Change the count and the bodies follow.`,
    shots: { inspector: 'The Pattern step with its Count' },
    actions: ['pattern'],
    features: ['pattern'],
  }),
  define({
    id: 'bodies',
    title: 'Bodies: name, hide, duplicate, remove',
    area: 'Modeling',
    summary: 'What can be done with a body as a whole.',
    keywords: 'body bodies name rename hide show isolate eye duplicate copy remove delete',
    body: `Bodies are listed at the top of Items.

- **Name** a body: double-click it, type, press Enter.
- **Hide** it with the eye. Alt-click the eye to show only that body, and again to show the rest.
- **Duplicate** the picked body with {{key:duplicate}}: the copy is a body of its own, beside the original.
- **Remove** a body with the delete button of its row, or press {{key:delete}} with the whole body picked.
- **Delete faces** from a body: pick a rounding, a bevel, a boss or a pocket and press {{key:delete}}. The faces around close the gap, so a rounded edge is sharp again. Where they cannot (the top of a box), Bezier says so and leaves the body as it was.

Each of these is a step in the history and can be undone, hiding included.

![](image:list)`,
    shots: { list: 'Two bodies in Items, one named Lid' },
    actions: ['duplicate', 'delete'],
    features: ['remove-body', 'remove-faces'],
  }),
  define({
    id: 'selecting',
    title: 'Select faces, edges and bodies',
    area: 'Modeling',
    summary: 'Click, add with Shift, drag a rectangle, and narrow what a click can pick.',
    keywords:
      'select selection pick click shift multiple filter faces edges bodies rectangle all deselect tab',
    body: `- **Click** picks exactly what is under the pointer.
- **Shift-click** adds a second one, or takes it off again.
- **Double-click** a body picks all of it and opens Move/Rotate.
- **Drag** on empty space draws a rectangle that selects what it touches; hold Shift to add to the selection.
- **Select all** is {{key:select-all}}. **Deselect** is {{key:deselect}}, or a click on empty space. A click on empty space with Shift held leaves the selection alone.

## The filter

Press {{key:filter-cycle}} to change what a click can pick: Anything, Faces, Edges or Bodies. The current one is named at the bottom, "Selecting Faces · Tab to change". A small hole wall is easier to pick with the filter on Faces.

![](image:filter)`,
    shots: { filter: 'The selection filter named in the corner' },
    actions: ['select-all', 'deselect', 'filter-cycle'],
  }),
] as const;
