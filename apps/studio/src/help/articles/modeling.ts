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
3. Change **Thickness** in the bar. To come back later, click Shell in History.

![](image:inspector)

If nothing is selected, Bezier says to select at least one face.`,
    shots: { inspector: 'The Shell step in History, with its Thickness' },
    actions: ['shell'],
    features: ['shell'],
  }),
  define({
    id: 'hole',
    title: 'Hole',
    area: 'Modeling',
    summary: 'Drill a hole into a face: plain, counterbored or countersunk.',
    keywords: 'hole drill bore counterbore countersink diameter depth through screw',
    body: `1. Click the face to drill, then choose Hole under Tools. The hole is made where you clicked.
2. Set what it is in the bar:

- **Size**: a metric screw from M2 to M12 sets the diameter and the head for you. **For** picks a hole the screw passes through, or a drill to cut a thread in. Custom lets you type the diameter.
- **Diameter** and **Depth**, or **Through all**.
- **Style**: Simple, Counterbore or Countersink. A counterbore adds a head diameter and depth; a countersink adds an angle.
- **X** and **Y** move it on the face.

![](image:inspector)

Without a face, Bezier says what to click.

## An existing hole

Click the wall of a hole that is already there, for instance in an imported part, and type another radius. It stays editable afterwards.`,
    shots: { inspector: 'The Hole step in History, with its style and diameter' },
    actions: ['hole'],
    features: ['hole', 'cylinder-radius'],
  }),
  define({
    id: 'thread',
    title: 'Thread',
    area: 'Modeling',
    summary: 'Cut a real metric thread into a shaft or a hole.',
    keywords: 'thread screw bolt nut metric iso pitch tap helix m3 m4 m5 m6 m8',
    body: `1. Click the round wall of a shaft or a hole.
2. Choose Thread under Tools. The pitch of the nearest metric size is set for you.
3. Change **Pitch** in the step if you want a finer or a coarser thread.

For a threaded hole, make a [hole](doc:hole) with **For** set to Tap first: it is drilled to the size the thread needs.

The thread stays one pitch short of each end, so it never cuts into what the wall stands on.

> A fine thread on a small part is the hard case: below about M5 it may be refused rather than come out wrong. For a printed part a thread that small rarely holds anyway; a heat-set insert or a plain hole for a self-tapping screw does.`,
    actions: ['thread'],
    features: ['thread'],
  }),
  define({
    id: 'boss',
    title: 'Boss',
    area: 'Modeling',
    summary: 'Stand a round post with a bore on a flat face, to take a screw.',
    keywords: 'boss screw post standoff dome insert mount tower',
    body: `Click a flat face where the post goes, and choose Boss under Tools. Set its **Diameter**, the **Bore** for the screw, and its **Height**. A bore of 0 leaves it solid.
`,
    actions: ['boss'],
    features: ['boss'],
  }),
  define({
    id: 'rib',
    title: 'Rib',
    area: 'Modeling',
    summary: 'Stiffen a part with a thin wall along a sketched line.',
    keywords: 'rib web stiffener gusset wall support',
    body: `Draw the rib as a line in a sketch, on a plane through the part. Choose Rib under Tools, and set its **Thickness** and **Height**. A negative height grows it the other way.

A rib follows straight lines; corners are fine, curves are not.
`,
    actions: ['rib'],
    features: ['rib'],
  }),
  define({
    id: 'lip',
    title: 'Lip and groove',
    area: 'Modeling',
    summary: 'Make two halves of a case locate on each other.',
    keywords: 'lip groove rim case enclosure lid box fit tongue',
    body: `Shell the part first, so its rim is a flat ring. Click the rim and choose Lip under Tools. A lip stands up along the inside of the wall.

On the other half, set **Type** to groove with the same **Width** and **Height**. The groove is cut wider and deeper by the **Clearance**, so the two slide together. 0.2 mm suits most printers.
`,
    actions: ['lip'],
    features: ['lip'],
  }),
  define({
    id: 'draft',
    title: 'Draft',
    area: 'Modeling',
    summary: 'Tilt walls so a part comes out of a mould.',
    keywords: 'draft taper mould mold casting angle release wall',
    body: `Click the walls, shift-clicking for more than one, and choose Draft under Tools. **Pull along** is the plane the mould opens from; **Angle** is the tilt. 1° to 3° is usual.

To draft while extruding, use the **Taper** of the extrude instead.
`,
    actions: ['draft'],
    features: ['draft'],
  }),
  define({
    id: 'snap-fit',
    title: 'Snap fit',
    area: 'Modeling',
    summary: 'Add a flexing hook that clicks two parts together.',
    keywords: 'snap fit clip hook cantilever latch',
    body: `Choose Snap fit under Parts. It is built at the origin; move it into place. Set the arm's **Length**, **Thickness** and **Width**, and the **Overhang** of its hook.

An arm that would bend too far at its root is refused, with the strain it would reach. Longer or thinner arms bend less.
`,
    actions: ['snap-fit'],
    features: ['snap-fit'],
  }),
  define({
    id: 'fit-test',
    title: 'Fit test',
    area: 'Modeling',
    summary: 'Print a plate that shows what clearance your printer needs.',
    keywords: 'fit test tolerance clearance calibration printer hole peg coupon',
    body: `Choose Fit test under Parts and set the **Diameter** you care about. Print it, break off the peg and try it in the row of holes. Each hole is one **Step** larger; the first that fits is the clearance to design with.
`,
    actions: ['fit-test'],
    features: ['fit-test'],
  }),
  define({
    id: 'exploded',
    title: 'Exploded view',
    area: 'Modeling',
    summary: 'Pull the bodies apart to see how a part goes together.',
    keywords: 'exploded view assembly apart separate bodies',
    body: `Choose Exploded view in the rail and drag **Apart**. Each body moves out from the middle of the model. It only looks: closing the panel puts everything back, and nothing in the part changes.
`,
    actions: [],
    features: [],
  }),
  define({
    id: 'wall-thickness',
    title: 'Wall thickness',
    area: 'Modeling',
    summary: 'See where a part is too thin to print or mould.',
    keywords: 'wall thickness thin analysis check print minimum heatmap',
    body: `Choose Wall thickness in the rail. The model is coloured by how thick it is at every point: red under the limit, green from twice it. **Thinnest allowed** sets the limit; the panel names the thinnest wall.

For a printed part, 0.8 mm is two lines of a 0.4 mm nozzle. It only looks: nothing in the part changes.
`,
    actions: [],
    features: [],
  }),
  define({
    id: 'solids',
    title: 'Box, cylinder, sphere, cone and torus',
    area: 'Modeling',
    summary: 'Start from a plain solid, without a sketch.',
    keywords: 'box cube block cylinder sphere ball cone torus ring primitive solid',
    body: `Choose one under Parts. It is built at the origin, and its sizes open below. **More** chooses the plane it stands on and whether it becomes a new body, joins the part or cuts it.

A cone with a **Top radius** is cut off flat.
`,
    actions: ['box', 'cylinder', 'sphere', 'cone', 'torus'],
    features: ['primitive'],
  }),
  define({
    id: 'gear',
    title: 'Gear',
    area: 'Modeling',
    summary: 'Make a spur gear from its teeth and module.',
    keywords: 'gear spur cog tooth teeth module involute pressure angle pinion transmission',
    body: `1. Choose Gear under Parts. A gear is built at the origin and its numbers open below.
2. Set **Teeth** and **Module**, the **Width**, and the **Bore** for the shaft. A bore of 0 leaves it solid.

Two gears mesh when they have the same module and pressure angle. Place them module × (teeth of one + teeth of the other) / 2 apart, centre to centre.

The teeth are true involutes on the standard 20° rack. Below 17 teeth a real gear is usually undercut; this one is not, so check it against its partner in Section.
`,
    actions: ['gear'],
    features: ['gear'],
  }),
  define({
    id: 'fastener',
    title: 'Screws, nuts and washers',
    area: 'Modeling',
    summary: 'Add a standard metric screw, nut or washer.',
    keywords: 'screw bolt nut washer fastener socket hex countersunk iso din metric library parts',
    body: `Choose Library under Parts, pick a part, its size and length, and press Add.

With a flat face selected, the part goes where you clicked it. **With its hole** drills the hole first: a clearance hole to ISO 273, with a counterbore for a socket head and a countersink for a countersunk screw, and the screw sits down in it.

Every part follows its standard, and offers only the sizes and lengths that standard has:

- Socket head screw, ISO 4762
- Hex bolt, ISO 4017
- Countersunk screw, ISO 10642, from M3
- Hex nut, ISO 4032
- Washer, ISO 7089

Threads are drawn plain, as they usually are in an assembly. Click the part in History and open More for **Modelled thread** when you want it real, for a print or a close look.

**Your parts** keeps your own: a STEP file and a picture. **From a server** shows the parts of a folder someone hosts; see Servers.
`,
    actions: ['library'],
    features: ['fastener'],
  }),
  define({
    id: 'spring',
    title: 'Spring',
    area: 'Modeling',
    summary: 'Make a coil spring from its diameters, pitch and turns.',
    keywords: 'spring coil helix wire compression pitch turns',
    body: `1. Choose Spring under Parts. It is built at the origin and its numbers open below.
2. Set the **Coil diameter**, measured to the middle of the wire, the **Wire diameter**, the **Pitch** from one coil to the next, and the **Turns**.

The pitch must be larger than the wire, or the coils would run into each other. The ends are left open, not ground flat.
`,
    actions: ['spring'],
    features: ['spring'],
  }),
  define({
    id: 'pipe',
    title: 'Pipe',
    area: 'Modeling',
    summary: 'Run a round tube along a sketched path.',
    keywords: 'pipe tube hose cable duct path route wall hollow sweep',
    body: `1. Draw the route in a sketch: open lines, arcs or a spline, end to end.
2. Choose Pipe under Parts. It follows the latest open sketch; **Path sketch** picks another.
3. Set the **Outer diameter** and the **Wall**. A wall of 0 makes a solid rod.

Round the corners of the route with arcs: a sharp corner in the path gives a sharp corner in the pipe.
`,
    actions: ['pipe'],
    features: ['pipe'],
  }),
  define({
    id: 'revolve',
    title: 'Revolve',
    area: 'Modeling',
    summary: 'Turn a sketch around an axis to make a round part.',
    keywords: 'revolve spin lathe turn axis round rotate profile angle bottle',
    body: `1. Draw a closed shape in a [sketch](doc:start-a-sketch) and finish it.
2. Choose Revolve under Tools, or press {{key:revolve}}. The shape is turned through a full circle.
3. The bar holds the **Axis** (the sketch's own horizontal or vertical, starting on the one the shape stands against), the **Angle**, and the **Result**: a new body, added to one, or cut from one.

![](image:inspector)

Without a closed shape, Bezier says to draw one first.`,
    shots: { inspector: 'The Revolve step in History, with Axis, Angle and Result' },
    actions: ['revolve'],
    features: ['revolve'],
  }),
  define({
    id: 'combine',
    title: 'Combine: union, subtract, intersect',
    area: 'Modeling',
    summary: 'Join bodies into one, cut one from another, or keep only where they overlap.',
    keywords: 'combine boolean union subtract intersect join cut merge bodies overlap difference',
    body: `1. Pick two bodies: the one to keep first, then Shift-click the other. In Items, click one body row and Cmd-click or Ctrl-click the second.
2. Choose Combine under Tools, or press {{key:union}}. The step starts as a join.
3. In History, click the step. **Operation** is Join, Cut or Intersect, and **Keep tools** keeps the second body.

The keys for the three: Union {{key:union}}, Subtract {{key:subtract}}, Intersect {{key:intersect}}.

![](image:inspector)

With fewer than two bodies picked, Bezier says: Select two bodies.`,
    shots: { inspector: 'The Combine step in History, with its Operation' },
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
3. In History, click Split. Choose the **Plane** (XY, XZ or YZ), the **Offset** from it, and a **Tilt** about X or Y.

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
    body: `1. Double-click a body to pick all of it, which also opens Move and Rotate. Or pick it in Items and press {{key:move-rotate}}.
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
3. In History, click Scale and type a **Factor**: 2 doubles it, 0.5 halves it.

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
3. In History, click Mirror to choose the **Plane** (YZ, XZ or XY), an **Offset**, and whether to **Keep original**.

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
4. In History, click Align for a **Gap** between the faces, or **Same direction** to have both faces look the same way.

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
3. In History, click Loft to choose **From sketch** and **To sketch**, **Straight sides** for flat faces between the sections, and the **Result**: a new body, added to one, or cut from it.`,
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
4. In History, click Sweep to change the **Profile sketch**, the **Path sketch** or the **Result**.

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
4. In History, click Wrap to set the **Height**: positive raises it, negative cuts it in.

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
4. In History, click Joint for the **Kind** (revolute to turn, slider to slide), the **Angle** or **Distance**, and the least and most it may go. A value past a limit stops at the limit.

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
3. In History, click Pattern. Set the **Count**, choose **Linear** or **Circular** as the arrangement, and its **Step** in X, Y and Z, or the **Axis** and the **Spread** in degrees for a circle.

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
    actions: ['duplicate', 'copy', 'paste', 'delete'],
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
