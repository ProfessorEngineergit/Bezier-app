import { define } from '../define.js';

export const FILES = [
  define({
    id: 'undo-redo',
    title: 'Undo and redo',
    area: 'Edit',
    summary:
      'Step back through what you did, and forward again, including after you reopen the project.',
    keywords: 'undo redo step back forward revert history ctrl z cmd z oops mistake reverse',
    body: `Press {{key:undo}} to take back the last change. Press {{key:redo}} to bring back what you took back. On a keyboard with a Control key, Ctrl and Y redoes as well.

There is no undo button on screen. The keys are the way.

![](image:items)

## What an undo covers

Every change to the project: a step added, a value changed, a body moved, a variable renamed, the project renamed. One action is one undo.

Selections and the camera are not changes, so undo leaves them alone. After an undo the selection is cleared, because the thing it pointed at may be gone.

## While you draw

In a sketch that is still open, {{key:undo}} takes back the last thing you drew, a line or a corner, and not the last step of the project. A shape you are in the middle of is taken back first. When you finish the sketch it becomes one step, and from then on one undo takes back the whole sketch.

> If there is nothing left to take back, Bezier says so: Nothing left to undo, or Nothing to redo.

## After you close the project

Undo still works when you open the project again. The steps are saved beside the project and are taken back only when they still match it exactly. If they do not, you start without an undo, and nothing is undone by mistake.

## What an undo is

An undo is a change like any other. It is written to the project's journal before it is applied, so it survives a crash, and it does not erase the step it reverses from the record. The journal grows a little with every undo.

## What clears redo

Any new change. Once you do something after an undo, the steps you took back are gone, and redo has nothing to bring back.

## Limits

- Bezier keeps the last 100 steps, and fewer when a step is very large, such as an imported file. The oldest give way first.
- Undo waits for a change that is still building. If you press it too early, Bezier says it is still updating the model. Try again in a moment.
- With a sketch that has lines in it and nothing of its own left to take back, Bezier says to finish or clear the sketch first.

See also [variables](doc:variables), which undo like any other change.`,
    shots: {
      items: 'Items after one undo: the box is back to its sketch, with the extrude taken back',
    },
    actions: ['undo', 'redo'],
  }),
  define({
    id: 'variables',
    title: 'Variables and expressions',
    area: 'Edit',
    summary:
      'Name a number once, write a size in terms of it, and change the size everywhere by changing the number.',
    keywords:
      'variables parameters expression formula equation named values user parameters calculate math units cm inches sin sqrt function',
    body: `A variable is a name for a number. Write a length or an angle as an expression that uses the name, and the part follows when the number changes.

## Make a variable

1. Press {{key:variables}}. The Variables panel opens. Press it again to close it.
2. Type a name, for example \`wall\`.
3. Type its value, for example \`4 mm\`.
4. Press Add, or Enter.

![](image:panel)

A name starts with a letter and uses only letters, digits and \`_\`. A name cannot be a unit or a function, such as \`mm\` or \`sin\`, and two variables cannot share a name. Bezier says why when a name is refused.

To change a variable, edit its name or its value in the list and press Enter. A new name is carried into every expression that uses the old one, in one step. The cross at the end of a row removes the variable.

Beside each variable is what it comes to. A mistake is written there in words instead.

## Use a variable in a step

Open a step in Items, such as an Extrude. A number field, such as a length or an angle, takes an expression as well as a number.

1. Click the field.
2. Type an expression, for example \`wall * 3\`. A leading \`=\` is allowed.
3. Press Enter.

The field keeps what you wrote, and the result is shown beside it: \`= 12 mm\`.

![](image:field)

While you type, a field that cannot be read is marked, and nothing is applied until the expression is whole. A name that does not exist is refused before it reaches the model.

To go back to a plain number, type a number in the field.

Change \`wall\` in the panel, and only the steps that use it are rebuilt. Undo walks back the variable change and then the expression, one at a time. See [undo and redo](doc:undo-redo).

## Units

A bare number is in millimetres for lengths and degrees for angles. Put a unit after a value to say otherwise:

- Length: \`mm\`, \`cm\`, \`m\`, \`in\`, \`ft\`
- Angle: \`deg\` or \`°\`, \`rad\`

\`2 cm\` is 20. \`(a + b) in\` works as well. A variable holds the converted number, so \`w = 2 cm\` shows as 20.

## What an expression can contain

- Numbers, with a point or a comma as the decimal mark: \`12.5\` or \`12,5\`.
- Variables, by name.
- \`+\`, \`-\`, \`*\`, \`/\`, \`^\` for a power, and brackets. \`×\` is read as \`*\`.
- The constant \`pi\`.
- Functions: \`sin\`, \`cos\`, \`tan\`, \`asin\`, \`acos\`, \`atan\`, \`sqrt\`, \`abs\`, \`round\`, \`floor\`, \`ceil\`, \`min\`, \`max\`.

The trigonometry functions take and give degrees, so \`sin(30)\` is 0.5. \`min\` and \`max\` take several values: \`max(wall, 3)\`. If you write decimals with a comma, separate the values with a semicolon: \`max(1,5; 2)\`.

A variable may use another one, in any order. Two that lead back to each other are refused, and the loop is named.

> Expressions are written in the number fields of a step's panel in Items.`,
    shots: {
      panel: 'The Variables panel with a variable wall equal to 4 mm',
      field: 'An Extrude distance written as wall * 3, with its result',
    },
    actions: ['variables'],
  }),
  define({
    id: 'import',
    title: 'Import a file',
    area: 'Files',
    summary:
      'Bring a STEP part, a scanned mesh, a drawing or a picture into the project by picking the file or dropping it on the window.',
    keywords:
      'import open file step stp stl obj dxf svg scan mesh drawing picture image photo png jpg jpeg webp tiff heic drop drag insert load bring in upload',
    body: `## Pick a file

1. Choose File on the left rail. Or press {{key:import}}.
2. Choose the file.

![](image:insert)

## Or drop it

Drag a file from your desktop over the window. The whole window is the target, the rail and the title bar included. A drop area follows the pointer.

![](image:drop)

Let go and the file is imported. Files that can never be read, such as films, PDFs and archives, get no drop area.

## What can come in

| File | What it becomes |
| --- | --- |
| STEP (\`.step\`, \`.stp\`) | A step called Import, with the part as a body of its own |
| STL (\`.stl\`), text or binary | A [reference mesh](doc:reference-mesh) |
| OBJ (\`.obj\`) | A [reference mesh](doc:reference-mesh) |
| DXF (\`.dxf\`) | A sketch on the XY plane |
| SVG (\`.svg\`) | A sketch on the XY plane |
| A picture: PNG, JPEG, WebP, GIF, BMP, ICO, AVIF, TIFF, HEIC | A [picture](doc:reference-image) on the XY plane to draw and model against |

Any other file is refused, and the notice lists what is accepted. 3MF can be exported but not imported.

A picture is read by the window itself, so the formats are the ones this system can decode. PNG, JPEG, WebP, GIF, BMP and ICO come in everywhere. AVIF, TIFF and HEIC come in where the system reads them, which the Mac app and Safari do. A format the window cannot read is refused by name, with what to do: save a copy as PNG or JPEG.

![](image:items)

## STEP

A STEP file keeps its real geometry, so it is a solid you can fillet, shell, cut and combine like one you made. The step keeps the text of the file inside the project, so the project does not depend on the original file. A large file takes a while: a bar shows reading and then building, and the model is outlined as it arrives. The model cannot be changed while the file is being read.

A part that arrives below the floor, or tilted, is set down on it.

## Meshes

STL and OBJ are triangles and not solids, so they come in only as something to look at and measure against. A mesh may have up to 400,000 triangles. A bigger one is refused with a note to simplify it first.

## Drawings

A DXF or SVG becomes a sketch on the XY plane, named after the file, and it extrudes like one you drew. See [extrude](doc:extrude).

## If it fails

A notice says so, with the reason: a mesh with no triangles, a damaged STL, an OBJ that points at a point it does not have. The project is left as it was.

Undo takes an import back like any other step. See [undo and redo](doc:undo-redo).`,
    shots: {
      insert: 'File on the left rail',
      drop: 'The drop area that follows the pointer when a file is dragged over the window',
      items: 'Items after importing a STEP part, a mesh and a drawing',
    },
    actions: ['import'],
    features: ['import-step'],
    places: ['insert-file'],
  }),
  define({
    id: 'reference-image',
    title: 'Pictures: place, size and crop',
    area: 'Files',
    summary:
      'Put a photograph, a scanned drawing or a logo on a plane, size it, crop it and move it, to draw and model against.',
    keywords:
      'picture image photo png jpg jpeg webp gif bmp tiff heic avif canvas underlay trace reference crop resize scale rotate opacity plane move place calibrate background',
    body: `A picture is for drawing and modelling against: a photograph of a part to trace, a scanned drawing to bring to size, a logo to fit. It is not a solid and not a sketch. It is drawn on a plane, see-through, and a click on the model goes through it to the model.

## Bring one in

Choose File on the left rail, or press {{key:import}}, or drop the picture on the window. See [import](doc:import) for the formats.

It comes in on the XY plane, whole, with its longer side 100 mm, and it is selected: its handles are on the canvas and its numbers are in a panel.

A large picture is brought down to 3072 pixels on its longer side before it is kept, and the project keeps it as one small file, so a photograph from a phone does not make the project heavy. A picture that is small enough is kept exactly as it is.

## Size and place it

In the panel, Size is chosen to begin with.

- **Drag a corner** to scale the picture about the opposite corner, which stays where it is. The proportions are kept. Hold Shift to stretch freely, or untick Keep proportions in the panel.
- **Drag the disc in the middle** to move it along its plane.
- **Drag the small circle above it** to turn it. Hold Shift to turn in steps of 15°.
- **Type the numbers.** Width and Height are the size shown, in millimetres, so a drawing that is 210 mm wide on paper can be set to 210. X and Y are where its middle is on the plane. Turn is the angle. Offset lifts it off the plane along the plane's normal.
- **Plane** puts it on XY, XZ or YZ.
- **Turn 90°** turns it a quarter turn.

Opacity is a slider. A lower value lets the model and the grid show through.

## Crop it

Choose Crop in the panel. The handles on the sides and corners now take part of the picture off instead of scaling it. The picture keeps its scale, so what is left stays where it was, and a dashed outline shows the whole picture. Drag a side outward again to bring back what you took off.

**Reset crop** brings the whole picture back, at the same scale and in the same place.

## Select it again

Click the picture to select it, or choose it in [Items](doc:items). Click anywhere that is not the picture, or press Escape, or close the panel with its cross, to let go of it. The panel can be dragged by its title and snaps to the edges of the window, as the Measure and Section panels do.

## Move it like a part

With the picture selected, press {{key:move-rotate}}. The move arrows appear. Along the plane they change X and Y. Straight out of the plane they change Offset. Copy leaves the picture where it is and makes another one.

## Good to know

- Every change is one step in the history. A drag is one step, and so is a number typed. See [undo and redo](doc:undo-redo).
- The eye in Items hides the picture without deleting it.
- A picture is kept in the project, so the original file is not needed afterwards.`,
    actions: ['move-rotate'],
    features: ['reference-image'],
  }),
  define({
    id: 'reference-mesh',
    title: 'Reference mesh',
    area: 'Files',
    summary:
      'A scan or a bought part, shown as a grey ghost to model against and never part of the solid.',
    keywords:
      'reference mesh scan stl obj triangles ghost underlay trace fit around measure against canvas',
    body: `A reference mesh is for modelling around something that already exists: a scan to fit a bracket to, a bought part to leave room for. It is not a solid, so you cannot fillet it or cut with it.

## Bring one in

Import an STL or an OBJ file. See [import a file](doc:import). A notice says As a reference mesh to model against, and a row appears in Items, under History, with the name of the file.

## How it looks

![](image:view)

- Grey and half see-through, so a part inside it still shows.
- Never picked. A click goes through it to the model, so it does not get in the way of selecting anything.
- Not in the bodies list, and not exported. It changes nothing in what you build.

## Where it lands

The mesh keeps the position it has in the file. Its numbers are read as millimetres. It is then moved straight down or up so its lowest point rests on the floor, and it is not moved sideways. If the scan has to line up with your part, model your part around where the scan is.

There is no scale control for it. If the file is in other units, correct it in the program that made it.

## Hide it

Move the pointer over its row in Items and click the eye. The mesh is hidden. Click the eye again to show it. The data stays in the project either way. The bin beside the eye removes the mesh from the project.

![](image:items)

## Size

The mesh is stored inside the project, as text. A detailed scan makes the project bigger and slower to open. The limit is 400,000 triangles; a mesh over it is refused.`,
    shots: {
      view: 'A grey, see-through mesh standing next to a box',
      items: 'The mesh row in Items, with its eye and bin',
    },
    features: ['reference-mesh'],
  }),
  define({
    id: 'export',
    title: 'Export',
    area: 'Files',
    summary:
      'Write the part or a sketch to a file for printing, for another CAD program or for a laser cutter.',
    keywords:
      'export save step stl 3mf dxf svg print slicer laser cutter cam download file selected body only write out',
    body: `1. Press **Export**, at the top right.
2. Choose a format.

![](image:menu)

The file is named after the project, with the ending of the format, and goes where your browser saves downloads. In the desktop app a save panel asks where. A notice says when it is done, with the format and the size. Cancelling the panel is fine and writes nothing.

## The formats

- **STEP**: keeps the real geometry. For handing the part to another CAD program.
- **3MF**: a mesh that keeps its units and each body as its own part. For slicers.
- **STL**: a mesh, so curves become triangles. For 3D printing.
- **DXF**: a sketch, exact, in millimetres. For CAM and other CAD programs.
- **SVG**: a sketch as a drawing at true size. For laser cutters.

STEP, 3MF and STL write the part. They say Nothing to export when there is no solid yet.

DXF and SVG write a sketch, the one that is open or the one selected in Items, and are named after it. With no sketch, they are greyed out and the menu says to open or select one.

## Only what is selected

When one or more bodies are selected, the top of the menu offers a box: Only the selected body, or Only the 2 selected bodies. It is ticked. Untick it to export everything.

![](image:selected)

## Close the menu

Press Escape, or click away from it.

> A mesh is a copy of the shape and cannot be edited as a part afterwards. Keep the project for that. Everything you make is saved as you go, so Export is only for sending work out. A [reference mesh](doc:reference-mesh) is not exported.`,
    shots: {
      menu: 'The Export menu with its five formats',
      selected: 'The menu offering to export only the selected body',
    },
    places: ['export'],
  }),
  define({
    id: 'back-to-projects',
    title: 'Back to your projects',
    area: 'Getting around',
    summary: 'Leave a project with one click. There is nothing to save first.',
    keywords: 'home back projects leave close exit quit library start page save finish',
    body: `Click the house at the top left of the editor, or press {{key:home}}. The start page opens.

![](image:house)

## Nothing needs saving

Every change is written to disk before it is applied. Leaving does not ask, and a project you come back to is as you left it. See [projects](doc:projects).

## The card

On the way out Bezier takes a picture of the model from the default view, framed on the model, and puts it on the project's card. It is the picture you see on the start page. If the picture cannot be taken, you still leave, and the card keeps the one it had.

## Special cases

- A project you made and did nothing in is not kept. It is removed when you leave, so there is no empty Untitled waiting on the start page.
- A sketch you are in the middle of is finished first, as it is when you leave sketch mode, and then you leave. It is not lost.
- A file still opening is given up when you press the house.
- In a lesson, the house leaves through the lesson. See [Learn](doc:learn).
- Escape does not leave the project. It puts away the tool, the selection or the sketch.`,
    shots: { house: 'The house button at the top left of the editor' },
    actions: ['home'],
  }),
];
