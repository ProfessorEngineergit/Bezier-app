import { define } from '../define.js';

export const DRAWINGS = [
  define({
    id: 'drawings',
    title: 'Drawings: technical sheets of your model',
    area: 'Workspaces',
    summary:
      'Turn the model into a dimensioned technical drawing: front, top, right and isometric views on a sheet, ready to print or send to a machinist.',
    keywords:
      'drawings drawing sheet technical 2d blueprint views orthographic projection print paper a4 a3 a2 layout drafting plan engineering drawing paper space dimension title block pdf dxf',
    body: `Drawings is a [workspace](doc:workspaces) that turns the model into sheets of paper. The views are projected from the real solid, hidden edges included, so they always match it.

![](image:workspace)

Open it from the workspace menu at the top left of the window, the button that names the workspace you are in. Nothing you do here changes the model.

## What is on screen

- **The desk**: the sheet sits on a dark desk. Scroll to pan, or drag the empty desk. Pinch, or hold Ctrl (⌘ on a Mac) and scroll, to zoom about the pointer.
- **The toolbar** along the top: **Dimension**, **Section** and **Detail**, then the zoom controls, then **+ Sheet**, **Update from model** (the circular arrow) and **Export Sheet**. When the window is narrow, or the Items panel is open, the words are left out and only the icons show. Point at one to read its name.
- **The inspector** on the right: an overview of all the sheets, then the groups **Sheet**, **Views**, **Annotations**, **Title Block** and **Branding**. Drag its left edge to make it wider; double-click the edge to reset it.
- **Items** at the left, behind the **Items** button in the rail: the sheets, and what each one shows. See [sheets](doc:drawings-sheets).
- **The status line** at the foot says the size, scale, projection and unit of the active sheet.

## The first sheet

A new project has one sheet, **Sheet 1**, on A3 in first-angle projection. It shows four views: **Front**, **Top**, **Right** and **Isometric**. The scale is chosen for you so that every view fits.

The sheet draws every body that is visible in the model. Hide a body in [Items](doc:items) and it leaves the sheet. A model with no solid shows "No views on this sheet".

## Make a drawing in four steps

1. Build the part in Modeling.
2. Open Drawings and look over the four views. Set the paper in [Sheet size, scale and extra views](doc:drawings-views) if the default does not suit.
3. [Dimension](doc:drawings-dimensions) the lengths that matter, and add tolerance frames if you need them.
4. Fill in the [title block](doc:drawings-title-block) and [export](doc:drawings-export) a PDF or DXF.

## Zoom

The buttons beside the percentage zoom out and in. Press the percentage to fit all the sheets on the desk. Click the desk once, then **F** fits, **+** zooms in and **−** zooms out.

## When the model changes

The views follow the model when its shape changes. If a sheet does not seem to, press **Update from model** and it is projected again.

> Everything you set on a sheet, its dimensions, titles and logo, is saved with the project. A dimension is drawn on paper, not on the model, so changing the model does not move it. Check your dimensions after you change the part.

## Next

- [Sheets and what they show](doc:drawings-sheets)
- [Sheet size, scale and extra views](doc:drawings-views)
- [Dimensions and tolerances](doc:drawings-dimensions)
- [The title block](doc:drawings-title-block)
- [Export as PDF or DXF](doc:drawings-export)`,
    shots: {
      workspace: 'The Drawings workspace with a filleted block with a hole on its first sheet',
    },
    places: ['drawings', 'drawing-toolbar', 'drawing-desk'],
  }),
  define({
    id: 'drawings-sheets',
    title: 'Drawing sheets and what each one shows',
    area: 'Workspaces',
    summary:
      'Add sheets, choose which bodies and sketches each one draws, move between them and delete them.',
    keywords:
      'sheet sheets add new delete items bodies sketches include overview multiple pages select pan fit second sheet detail drawing set',
    body: `A drawing can have several sheets, for example one for the part and one for a detail. Each sheet has its own size, views, dimensions and title block.

## Add a sheet

Press **+ Sheet** in the toolbar, or **+** at the top of the Items panel. The new sheet is named **Sheet 2**, **Sheet 3** and so on, and Items opens so that you can choose what it shows.

The new sheet starts with no bodies, so it is blank and **Export Sheet** is greyed out until you tick something. It copies the size, projection, title, author, company, watermark and logo of the sheet you were on. Only the drawing number is new: DWG-002, DWG-003 and so on.

## Choose what a sheet shows

1. Press **Items** in the rail at the left of the Drawings workspace. The panel opens.
2. Under **Included on** the active sheet, tick the **Bodies** you want drawn. **All bodies** ticks them all; **None** clears them.
3. Tick **Sketches** to draw a sketch's lines on every view too. Construction lines are left out.

![](image:items)

A sheet that you have not changed from the start shows every visible body. Once you tick or clear a box, the sheet keeps exactly the list you chose, even when you add bodies later.

Changing what a sheet includes clears its dimensions, because they would no longer point at the same lines.

## Move between sheets

Click a sheet in the list, or click its paper or its name above it on the desk. Only one sheet is active, the one you can edit. The others are drawn as pictures and you cannot click into them.

The **Overview** at the top of the inspector shows all the sheets small. Click or drag in it to move the desk, and press **Fit all** to see them all at once.

## Delete a sheet

Press the bin at the end of its row in Items. The bin is greyed out on the last sheet, which cannot be deleted.

Each row says the size, the drawing number, and how many bodies and sketches the sheet shows.

> Sheets are named by their position, and cannot be renamed. The drawing number in the [title block](doc:drawings-title-block) is what identifies a sheet on paper.

## Related

- [Drawings overview](doc:drawings)
- [Sheet size, scale and extra views](doc:drawings-views)
- [Bodies and Items](doc:bodies)`,
    shots: {
      items:
        'The Items panel with two sheets, the bodies of the active one, and the overview at the right',
    },
    places: ['drawing-items', 'drawing-overview'],
  }),
  define({
    id: 'drawings-views',
    title: 'Sheet size, scale and extra views',
    area: 'Workspaces',
    summary:
      'Choose paper size, projection and scale, show hidden lines, and add a section or detail view.',
    keywords:
      'sheet size a4 a3 a2 scale projection first angle third angle hidden lines dashed line weight section detail view cut hatch zoom magnify cross section 1:1 2:1',
    body: `These settings are in the inspector, in the **Sheet** and **Views** groups. They apply to the active sheet only.

![](image:inspector)

## Sheet

- **Size**: A4, A3 or A2, always landscape.
- **Projection**: **First angle** or **Third angle**. It decides where the views sit, and the symbol in the title block says which one the sheet uses. First angle is common in Europe and Asia, third angle in North America.
- **Scale**: **Auto**, or a fixed scale from 1 : 50 to 10 : 1. Auto picks the largest standard scale at which every view fits, and its name shows the scale it chose, for example **Auto (2 : 1)**. Choose a fixed scale to override it.

## Views

- **Hidden lines**: draws the edges behind the part as dashed lines. Switch it off for a cleaner sheet.
- **Line weight**: 0.25, 0.35, 0.5 or 0.7 mm for the visible outline. Hidden lines are drawn thinner.

## Section A–A

Switch on **Section A–A**, or press **Section** in the toolbar. A cut through the part is added to the sheet with the cut face hatched. **Cut height** sets where the cut is, from 5 to 95 percent of the height. It starts at the middle.

Use a section to show what is inside: a hole, a pocket, a wall thickness. Press **Section** again to remove it.

## Detail B

Switch on **Detail B · 2 : 1**, or press **Detail** in the toolbar. A circle is placed on the top view and the part inside it is drawn again, twice as large, as its own view. The **X**, **Y** and **R** fields give the circle's centre and radius in millimetres. Change them to move the detail to the feature you want to show.

## With more views

With more than four views, for example a section and a detail, the sheet lays them out in a grid of six and picks a smaller scale if it must.

> Changing the size, projection, scale, section or detail clears the dimensions on the sheet, because they are measured on the paper. Set these first and dimension afterwards.

## Related

- [Dimensions and tolerances](doc:drawings-dimensions)
- [Drawing sheets](doc:drawings-sheets)
- [Section view in the editor](doc:section-view)`,
    shots: {
      inspector:
        'The Sheet and Views groups of the inspector with a section and a detail switched on, and the sheet beside them',
    },
    places: ['drawing-sheet-settings', 'drawing-section', 'drawing-detail'],
  }),
  define({
    id: 'drawings-dimensions',
    title: 'Dimensions and geometric tolerances on a sheet',
    area: 'Workspaces',
    summary:
      'Measure between two points of a view, edit and place the number, and add geometric tolerance frames.',
    keywords:
      'dimension dimensions measure length tolerance gdt gd&t datum frame feature control flatness position profile parallelism perpendicularity roundness annotation aligned horizontal vertical',
    body: `A dimension on a sheet is a measured length between two points of one view, drawn with arrows and a number. It is the number a machinist reads, so the sheet needs only the ones that matter.

## Add a dimension

1. Press **Dimension** in the toolbar, or click the desk and press **D**. Small blue dots show where a dimension can start and end.
2. Choose **Aligned**, **Horizontal** or **Vertical** in the line that appears at the foot of the screen. In the isometric view only Aligned is available, and it reads the true length in 3D.
3. Click one end. A larger dot marks it, and the line says "Choose another endpoint in this view".
4. Click the other end, in the same view. The dimension is drawn with the measured length in millimetres.

![](image:tool)

Keep clicking pairs of points to add more. When you are done, press **Esc** to leave the tool, or press **Dimension** again. If you clicked the wrong first point, press **Esc** once to drop it, and **Esc** again to leave the tool.

![](image:made)

Only the ends of visible lines can be picked, and a click that is not near a blue dot does nothing. The same two points are not dimensioned twice.

## Place and edit it

- **Drag** the number to move the dimension line and the text.
- **Double-click** the number to type your own text, for example 40 ±0.1. Press Enter to keep it, or Esc to cancel. The text is only a label; it does not change what is measured.
- To remove one, Tab to its grip until it is focused and press Delete. The grip is named "Move dimension 1", "Move dimension 2" and so on. With the grip focused, the arrow keys nudge it by 1 mm and Shift with an arrow by 5 mm.

The **Annotations** group in the inspector counts the dimensions. **Undo** removes the last one; **Clear** removes them all.

## Geometric tolerances

The same group builds feature control frames, the boxes that say how exact a feature must be.

1. Choose a characteristic: **Position**, **Flatness**, **Perpendicularity**, **Parallelism**, **Roundness** or **Profile**.
2. Type the **Tolerance** in millimetres. It takes digits and a decimal point.
3. Type the **Datum** letter or letters, up to three. Flatness and roundness have no datum, so the field is greyed.
4. Press **Add**.

![](image:frame)

The frames stack upwards from the lower left corner of the sheet, up to six. The **×** beside a frame in the list removes it. The datum letters are text inside the frame: Bezier does not draw a datum symbol on a view.

## Things to know

- Dimensions are drawn on the paper, so they are cleared when something changes the views: size, projection, scale, a section or detail, or the bodies a sheet includes. Dimension last.
- If a dimension reads a number you did not expect, check the scale in the status line: the number is the real length of the part, not the length on the paper.

> Dimensions and frames are drawn as lines and text, so they go into the [PDF and DXF](doc:drawings-export) exactly as you see them.

## Related

- [Sheet size, scale and extra views](doc:drawings-views)
- [The title block](doc:drawings-title-block)
- [Dimensions in a sketch](doc:dimensions)`,
    shots: {
      tool: 'The Dimension tool with the first point picked, the blue dots and the type line at the foot',
      made: 'The front and top views of the block with three dimensions',
      frame: 'Two tolerance frames in the lower left of the sheet and their list in the inspector',
    },
    actions: [],
    places: ['drawing-dimension', 'drawing-tolerance'],
  }),
  define({
    id: 'drawings-title-block',
    title: 'The title block, watermark and logo',
    area: 'Workspaces',
    summary: 'Fill in who made the drawing, its number and revision, and brand the sheet.',
    keywords:
      'title block drawn by author company drawing number revision date watermark logo svg brand header cartouche stamp draft confidential',
    body: `Every sheet has a title block in its lower right corner, in the layout of ISO drawings.

## Fill it in

Two ways, which edit the same fields:

- In the inspector, open **Title Block** and fill in **Title**, **Drawing No.**, **Revision**, **Drawn by** and **Company**.
- On the sheet, double-click a field of the block, type, and press Enter. Esc cancels. With the keyboard, Tab to a field and press Enter to edit it.

![](image:block)

The sheet fills in the rest: **Scale**, the **Sheet** number out of the total, today's **Date**, the **Format** and unit, and the projection symbol with its name. You cannot edit these.

A new project's first sheet takes the project's name as its title and a number such as DWG-001. The revision starts as A and the company as Bezier. An empty title is shown as "Untitled".

## Branding

Open **Branding** in the inspector. It starts folded.

- **Watermark**: type a word, for example PROTOTYPE, and it is drawn large and faint across the sheet. **Watermark opacity** appears, from 2 to 30 percent. Clear the field to remove it.
- **Logo**: press **Import…** and choose an SVG file. It takes the place of the company name in the title block. **Replace…** and **Remove** change or take it away.

![](image:branding)

> The logo has to be vector paths with a viewBox, and under 1 MB. Rectangles, circles, text, groups with a transform and links are refused with a message, such as "Convert logo shapes and text to paths". Convert them to paths in your vector program first.

The block, watermark and logo are all part of the [export](doc:drawings-export). A sheet you add later starts with a copy of these settings, see [sheets](doc:drawings-sheets).

## Related

- [Drawings overview](doc:drawings)
- [Dimensions and tolerances](doc:drawings-dimensions)
- [Export as PDF or DXF](doc:drawings-export)`,
    shots: {
      block: 'The title block of a sheet with the title, revision, author and company filled in',
      branding: 'A sheet with a faint PROTOTYPE watermark and a logo in the title block',
    },
    places: ['drawing-title-block'],
  }),
  define({
    id: 'drawings-export',
    title: 'Export a sheet as PDF or DXF',
    area: 'Workspaces',
    summary: 'Save the active sheet as a vector PDF for print or a DXF for CAD and CAM.',
    keywords:
      'export pdf dxf print save vector cad cam autocad download drawing sheet r2013 millimetres machinist send',
    body: `1. Make the sheet you want active.
2. Press **Export Sheet** in the toolbar.
3. Choose a format.

![](image:menu)

| Format | For | Notes |
| --- | --- | --- |
| **PDF** | Print and review | Vector, at the size of the sheet, in landscape. No picture of the screen is put in it. |
| **DXF** | CAD and CAM | R2013, in millimetres. Visible and hidden lines are on separate layers (VISIBLE and HIDDEN), and the text is kept as text on a layer named ANNOTATIONS. |

The file is named after the drawing number, for example DWG-001.pdf. In a browser it goes to your downloads folder. In the desktop app a save dialog asks where.

Export Sheet is greyed out when the sheet has no views.

Only the active sheet is exported. To export another, choose it and export again.

What you see is what is saved: views, dimensions, tolerance frames, title block, watermark and logo. The blue dimension dots and anything else that only helps while you work are left out.

## If something looks wrong

- Check the sheet before you export. Dimensions that were cleared by a change are not in the file.
- For print, choose the same paper size in the print dialog as the sheet: A3 for an A3 sheet, and print at 100 percent.

## Related

- [Drawings overview](doc:drawings)
- [The title block](doc:drawings-title-block)
- [Export from the editor](doc:export)`,
    shots: { menu: 'The Export Sheet menu open with PDF and DXF' },
    places: ['drawing-export'],
  }),
] as const;
