import { define } from '../define.js';

export const BASICS = [
  define({
    id: 'editor-at-a-glance',
    title: 'The editor at a glance',
    area: 'Getting around',
    summary:
      'Where everything is: the bar on top, the rails at the sides, the orientation cube, and the model in the middle.',
    keywords:
      'layout interface overview start beginner tour where bar rail cube toolbar menu ui screen window panel home first time lost find',
    body: `The model is in the middle. Everything else sits at the edge and stays quiet until you reach for it.

![](image:layout)

1. **The top bar.** The house on the left goes back to your projects. Next to it is the workspace button, which reads Modeling to begin with, and then the name of the project: click the name to rename it. Export is on the right.
2. **The left rail.** Items at the top, then Sketch, File, Transform and Tools in the middle, then Section View and Measure at the bottom. Rest the pointer on the rail and the names appear.
3. **The orientation cube**, top right. Click a side to look from there.
4. **Quick settings**, the button at the bottom right. It opens one small panel with View, Display and Units & Grid as tabs across its top.

## The left rail

![](image:rail)

- **Items** opens the list of what the project is made of. See [items](doc:items).
- **Sketch** is a mode. The rail turns into the sketch tools until you press Finish Sketch. See [start a sketch](doc:start-a-sketch).
- **File** brings a file in: a part, a mesh, a drawing or a [picture](doc:reference-image). See [import](doc:import).
- **Transform** and **Tools** open a second column of commands beside the rail, each with its key. Transform holds Move/Rotate, Scale, Mirror and Pattern. Tools holds Chamfer/Fillet, Extrude, Shell, Hole, Revolve, Combine and Split. Press the same button again to put the column away.
- **Section View** and **Measure** look at the model without changing it. See [section view](doc:section-view) and [measure](doc:measure).

## Quick settings

- **View**: the standard views, Zoom to fit and the field of view. See [standard views](doc:standard-views).
- **Display**: Shaded, Wireframe or X-Ray, edges and axes, and the theme. See [Wireframe, X-Ray and Shaded](doc:display-modes).
- **Units & Grid**: the unit of length, and the grid: whether it is shown, its plane and whether a sketch snaps to it.

What holds in every workspace and not only for this model, such as the theme, is under a heading marked Every workspace. Visualize and Drawings have the same button, at the foot of the picture beside their own panel, with only the sections that apply there.

> Nothing is saved with a button. Every change is written to disk before it is applied, so closing the tab loses nothing. If something goes wrong, see [undo and redo](doc:undo-redo).

To move the camera, see [orbit, pan and zoom](doc:navigate).`,
    shots: {
      layout: 'The editor with a box in it, and the places the text names',
      rail: 'The Tools column open beside the left rail',
    },
    places: ['title-bar', 'rail', 'view-cube'],
  }),
  define({
    id: 'navigate',
    title: 'Orbit, pan and zoom',
    area: 'Getting around',
    summary:
      'Move the camera around the model with a mouse or a trackpad, the way the CAD you know does.',
    keywords:
      'orbit rotate pan zoom camera mouse trackpad scroll wheel pinch navigation gesture move view turn preset blender fusion solidworks onshape rhino sketchup inventor tumble spin',
    body: `Orbit turns the model, pan slides it, zoom brings it closer or further away. Bezier starts with its own way of doing each (Native), and can follow another program instead.

## The default

- **Orbit**: right-drag, or two fingers on a trackpad.
- **Pan**: middle-drag, or Shift and right-drag, or Shift and two fingers.
- **Zoom**: the wheel, or a pinch.

You can turn all the way around the model, over the top and under the bottom, without having to turn back. When the hand stops, the model stops.

To look from exactly the front, the top or another side, use the orientation cube. See [standard views](doc:standard-views).

## Use the keys of another program

1. Open Settings and choose Interaction. See [open Settings](doc:open-settings).
2. Next to Navigate like, choose Native, Blender, Fusion 360, SolidWorks, Onshape, Rhino, SketchUp, Siemens NX, Alias or Inventor.
3. To change one action only, use the lists under Mouse. A changed action says Changed, and Reset All Mouse Bindings puts them all back to the preset.

![](image:settings)

## If the wheel does the wrong thing

A browser cannot tell a mouse wheel from a trackpad, so Bezier guesses. If the wheel turns the model when you meant to zoom, or two fingers zoom when you meant to orbit, say which you use: Settings, Interaction, Scrolling comes from, or Scrolling with under View in the quick settings. The switch Wheel zooms the other way reverses the wheel.

> To look straight at a face, see [square up to a face](doc:square-view).`,
    shots: { settings: 'Settings, Interaction, with Navigate like and the Mouse actions' },
    settings: ['interaction'],
  }),
  define({
    id: 'projects',
    title: 'Projects, folders and the start page',
    area: 'Getting around',
    summary:
      'Everything you have made is on the start page, on your machine, with the picture you last saw.',
    keywords:
      'projects start page home folder new rename delete move card library organise organize file open recent duplicate remove list',
    body: `The start page is what opens first. Every project on this machine is a card with the last view you had of it, newest first.

![](image:start)

## The everyday steps

1. **New Project** is at the top right of the page. Ctrl or Cmd and N does the same while the start page is showing.
2. Click a card to open it. Click the house in the editor to come back.
3. **Rename**: click the name on a card, or the name of the project in the editor. Press Enter to keep it, Escape to leave it as it was.
4. **Folders**: press the folder button beside Folders in the sidebar, then drag cards onto the folder.
5. **Delete** asks once, then removes the project from this device.

## The card menu

Press the three dots on a card, or right-click anywhere on it.

![](image:menu)

- **Open**
- **Rename…**
- **Move to Folder…**: the same as dragging the card onto a folder.
- **Export…**: opens the project and points you to Export in the top bar. See [export](doc:export).
- **Delete**

Once you are connected for [collaboration](doc:collaboration), Share… is in the menu too.

## Folders

A project is in one folder at most, and All Projects always lists everything, wherever it is filed. Click a folder in the sidebar to see only its projects. Click the name of the open folder to rename it, or use its three dots for Rename… and Delete. Deleting a folder does not delete its projects: they go back to All Projects.

To move several projects at once, Shift-click or Cmd-click or Ctrl-click the cards, or drag a rectangle over empty space around them, then drag any one of them onto a folder. Escape clears the selection.

## Delete

Delete asks "Delete project?" and says the project will be permanently deleted from this device. This cannot be undone. Press Cancel if you are not sure.

> A new project you leave without doing anything is not kept.

To find a project among many, see [search](doc:search).`,
    shots: {
      start: 'The start page with a library of projects, a folder, and New Project',
      menu: 'The menu of a project card',
    },
    places: ['start-page'],
  }),
  define({
    id: 'search',
    title: 'Search everything from one field',
    area: 'Getting around',
    summary:
      'One field on the start page finds projects, settings and wiki articles. ⌘K finds an article from anywhere.',
    keywords:
      'search find field projects settings docs wiki article operator slash quick filter look up where command k shortcut palette',
    body: `Use the search field to find a project by name, a setting by what it does, or an article by what it explains.

1. The field is at the top of the sidebar on the start page. Press **/** to jump into it.
2. Type a word. Projects, settings and wiki articles that hold it appear together, under Results for what you typed.
3. Click a result. A project opens, a setting opens its page in Settings, an article opens in the wiki.

![](image:results)

Several words must all be found. A project is also found by the name of its folder.

## Look in one place only

Start with the place and a colon.

- **projects:** bracket looks only through project names.
- **settings:** theme looks only through Settings, and opens it, narrowed to what matches.

Spelled out, \`project\`, \`setting\`, \`prefs\` and \`preferences\` work too.

## On other pages

On the Learn and Community pages the words narrow what is on the page instead. Start with \`projects:\` to reach projects from there.

## To clear it

Press Escape in the field. If nothing matches, the page says so and reminds you of the two prefixes.

## Find an article from anywhere

Press Ctrl or Cmd and K, on the start page or inside a project. A search over the whole wiki opens on top of whatever is on screen. Type, move with the arrow keys and press Enter. Inside a project the article opens in a window floating beside the model. See [the wiki](doc:community).

> Search finds articles about [the editor](doc:editor-at-a-glance), [Settings](doc:open-settings) and everything else here. Look up words from the program you know: fillet, loft, constraint, pad, extrude.`,
    shots: {
      results: 'The search field with a word typed, and the projects, settings and articles found',
    },
    places: ['search'],
  }),
  define({
    id: 'workspaces',
    title: 'Modeling, Drawings, Visualize and Simulation',
    area: 'Workspaces',
    summary: 'Four workspaces over the same model, switched from the top bar.',
    keywords:
      'workspace modeling design drawings visualize simulation switch mode render stress sheet change tab',
    body: `A workspace is a way of looking at the one model you have: building it, testing it, showing it, drawing it. They share everything. A change made in Modeling is in the others at once.

1. Press the workspace button in the top bar, next to the house. It names the workspace you are in.
2. Choose one.

![](image:menu)

- **Modeling**: sketch, model and refine solids. This is where a project opens.
- **Simulation**: loads, supports, stress and topology. See [simulation](doc:simulation).
- **Visualize**: materials, studio lighting and renders. See [visualize](doc:visualize).
- **Drawings**: technical sheets, dimensions and vector exports. See [drawings](doc:drawings).

## By keyboard

Press Alt and Cmd (or Ctrl) with 1, 2, 3 or 4 for Modeling, Simulation, Visualize and Drawings, in the order of the menu. Escape closes the menu.

> Switching workspace changes the tools on screen. It does not change the model.`,
    shots: { menu: 'The workspace menu, open' },
    places: ['workspace-menu'],
  }),
  define({
    id: 'items',
    title: 'Items: what the project is made of',
    area: 'Getting around',
    summary:
      'A list of the bodies and sketches of the project, where you select, rename, hide and reopen them.',
    keywords:
      'items tree list bodies sketches filter rename hide show eye panel layer outliner browser feature tree model tree isolate folder',
    body: `Items is the list of what is in the project: its bodies, its sketches, and any reference meshes and imported files. Use it to pick something that is hard to click, to hide what is in the way, and to get back into a sketch.

1. Press the layer button at the top left, or {{key:items}}. The list slides in beside the rail. Press it again to put it away.
2. Click a row to select it. A body is picked in the model too; a sketch opens its numbers on the right. Shift-click picks every row between the last one you clicked and this one; Cmd-click or Ctrl-click adds or removes one row.
3. Double-click a body's name to rename it. Enter keeps the name, Escape leaves it. Renaming can be undone.
4. The **eye** hides a body. It shows on the row under the pointer and on the selected row, and stays on anything hidden. Alt-click the eye to show that body alone.
5. The filter at the top, All Items to begin with, narrows the list to Sketches or to Bodies.
6. Drag the right edge of the panel to make it wider. Double-click the edge to set it back.

![](image:list)

## What the rows are

- **Bodies** each solid of the project. A file brought in with [import](doc:import) is a folder named after the file, holding the bodies it contained; click the folder to pick them all.
- **Sketches** each drawing. At the far end of a sketch row is the body it was built into. Once a sketch has been used it is no longer drawn in the model, and its row is dimmed with a struck eye. Click the row to bring it back.
- Hiding a body does not delete it. Hidden bodies stay in the list and come back with the eye.

## Reopen a sketch

Double-click a sketch row to draw in it again. See [change a sketch afterwards](doc:reopen-sketch).

![](image:filter)

> Change a number in a sketch and everything built from it is built again. See [variables](doc:variables) to name a number once and use it in many places.`,
    shots: {
      list: 'The Items list: two bodies, one hidden, and the sketches they were built from',
      filter: 'The filter menu of Items',
    },
    actions: ['items'],
    places: ['items'],
  }),
] as const;
