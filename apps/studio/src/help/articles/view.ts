import { define } from '../define.js';

export const VIEW = [
  define({
    id: 'display-modes',
    title: 'Wireframe, X-Ray and Shaded',
    area: 'View',
    summary:
      'Choose how bodies are drawn: solid, as their edges only, or see-through, and what is drawn around them.',
    keywords:
      'wireframe xray x-ray zebra curvature analysis smooth continuity shaded display mode edges transparent see through hidden lines grid axes show hide shading render style appearance',
    body: `Shaded is the usual way to look at a model. Wireframe and X-Ray are for seeing what is behind a face: a hole that runs through, an edge on the far side, a body inside another.

1. Open a project with at least one body.
2. Press Quick settings at the bottom right and choose Display.
3. Under Shading, choose Shaded for solid faces, Wireframe to see only the edges, or X-Ray to see through the faces.

![](image:panel)

![](image:xray)

The choice stays until you change it.

## Checking a surface

Under **Surface analysis**, **Zebra** draws the model as the reflection of a room of light bars: where two faces meet smoothly the stripes run on, where they only touch they kink, and where they meet at an edge they break. **Curvature** colours the surface by how tightly it bends: blue is flat, green gentle, red a radius of about 5 mm or less. **Off** goes back to Shaded.

## What is drawn around the model

Below Shading are two buttons that stay pressed while the thing is shown: **Edges** and **Axes**. Press one to hide it, and again to bring it back. The grid is under Units & Grid, with everything else about it: **Show grid**, **Grid on** for the plane it lies in (XY, YZ or ZX), and Snap to grid.

Under **Look**, marked Every workspace, are the Theme (System, Light or Dark) and Detail while modelling, which is Automatic, Full or Light. Light draws curves coarser on a very large model; exports stay full. These hold everywhere, not only for this model, and are explained under [viewport settings](doc:settings-viewport) and [appearance](doc:settings-appearance).

The three sections are the tabs across the top of the panel: View, Display and Units & Grid. The panel opens on the one you looked at last.

> To look at the model from another side, see [standard views](doc:standard-views). To cut it open instead of seeing through it, see [section view](doc:section-view).`,
    shots: {
      panel: 'The Display panel with Wireframe chosen',
      xray: 'The same model in X-Ray',
    },
    places: ['display'],
  }),
  define({
    id: 'square-view',
    title: 'Square up to a face',
    area: 'View',
    summary: 'Look straight at a face, centred, without reaching for the orientation cube.',
    keywords:
      'normal to look at orthogonal face align view space centre center square up perpendicular straight on flat spacebar',
    body: `Use this to look straight at a face before you sketch on it, measure it or check a hole.

1. Move the pointer over the face you want to look at.
2. Press {{key:view-square}}. The view turns to face it and centres it.

![](image:before)

![](image:after)

On a curved face the view squares up to the surface at the pointer.

With the pointer over no face, the same key squares up to the last side picked on the cube, and to Top if none has been picked yet.

## If it turns somewhere else

The pointer has to be over the model, on a face, when you press the key. Over empty space, or over the rails, the key goes to the cube side instead. You can change the key in Settings, Shortcuts. See [shortcuts](doc:settings-shortcuts).

> To go back to a standard side or to the starting view, see [standard views](doc:standard-views). To sketch on the face you are looking at, see [start a sketch](doc:start-a-sketch).`,
    shots: {
      before: 'A box in the starting view, with the pointer over its front face',
      after: 'The same box after Space: the front face square to the screen',
    },
    actions: ['view-square'],
  }),
  define({
    id: 'standard-views',
    title: 'Front, top and the other standard views',
    area: 'View',
    summary:
      'Jump to one of the six sides, back to the starting view, or fit everything on screen.',
    keywords:
      'front back top bottom left right view cube orientation reset home fit zoom all isometric default camera side elevation plan zoom extents field of view perspective orthographic',
    body: `The orientation cube, top right, shows which way you are looking and takes you to any side.

![](image:cube)

1. Click a side of the cube, or press the key for that view.
2. Click an edge of the cube to look along it, halfway between two sides. Click a corner to look from between three.
3. Drag the cube to orbit, the way you would turn a model by hand.
4. When the view is square to an axis, two arrows appear beside the cube. Each turns the view a quarter turn.
5. Press {{key:zoom-fit}} to bring the whole model into view.

The keys: Front {{key:view-front}}, Back {{key:view-back}}, Top {{key:view-top}}, Bottom {{key:view-bottom}}, Right {{key:view-right}}, Left {{key:view-left}}, and back to the starting view {{key:view-reset}}.

## From the View panel

Press Quick settings at the bottom right and choose View. The panel has Zoom to fit, Default, Front, Back, Top, Bottom, Right and Left as buttons. Default is the starting view.

![](image:panel)

Below them:

- **Saved views**: under the standard views, type a name and press **Save view** to keep the camera as it is; click the name to come back to it. They are saved with the project and undo like any edit.
- **Field of view** from Near parallel (5°) to 75°. The view is a true parallel view at every place on the cube (a side, an edge or a corner); turn away from it and the lens is back. With the pointer on the cube, Space goes to the place it is on. A small angle looks like a drawing, a large one like a wide lens; the part stays the same size on screen as you change it.
- **Glide to a chosen view** switches between turning smoothly to the new side and cutting to it.
- Under **Moving the view**, marked Every workspace: **Scrolling with** says whether your scroll comes from a mouse or a trackpad (see [orbit, pan and zoom](doc:navigate)), and **While moving the view** chooses between a sharp and a smooth picture while the view turns.

> Clicking a side of the cube also decides which plane the next sketch is drawn on. See [start a sketch](doc:start-a-sketch).`,
    shots: {
      cube: 'The orientation cube squared to Top, with its quarter-turn arrows',
      panel: 'The View panel with the standard views and Zoom to fit',
    },
    actions: [
      'view-front',
      'view-back',
      'view-top',
      'view-bottom',
      'view-right',
      'view-left',
      'view-reset',
      'zoom-fit',
    ],
  }),
] as const;
