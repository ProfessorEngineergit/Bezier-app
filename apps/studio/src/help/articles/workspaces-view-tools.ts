import { define } from '../define.js';

export const VIEW_TOOLS = [
  define({
    id: 'measure',
    title: 'Measure the distance between two points',
    area: 'View',
    summary: 'Click two points on the model to read the straight-line distance, and pin it.',
    keywords:
      'measure measurement distance ruler dimension length point to point delta xyz inspect check pin copy how long how far size tape',
    body: `Measure reads a length off the model. It never changes it.

## Take a measurement

1. Press **Measure** at the foot of the left rail, in Modeling. A **Measure** panel opens, with the steps **First point** and **Second point**.
2. Move over a face. Dots show the points a click can land on: its corners and its middle.
3. Click the first point, then the second. A line is drawn between them.
4. The **Distance** appears in the panel, in the unit you have chosen for the project (Units & Grid in the quick settings).

![](image:panel)

Click the number to copy it. It is on its way to a field or a message most of the time, so it is a button.

## Axis distances

Switch on **Include X, Y, Z deltas** to see how much of the distance lies along each axis.

## Keep it

- **Pin measurement** keeps the reading drawn on the model after you leave Measure. The panel lists pinned readings; **×** removes one.
- **New measurement**, or **Clear**, starts again without leaving the tool.
- **Exit Measure**, the **×** of the panel, closes it. Esc does the same.

Pinned readings go away when the model changes or the project closes, because their points are positions in space and not parts of the model.

## Moving the panel

Drag the grip at the top of the panel. With the grip focused, the arrow keys move it by 10 pixels, and with Shift by 40.

## Good to know

- It measures between points, not along an edge or around a curve. For the size of something you are building, a [dimension](doc:dimensions) in the sketch is the better tool.
- Measure is not in the Simulation rail. Switching workspace leaves it.
- Choosing a modeling tool leaves Measure. Pinned readings stay on screen.`,
    shots: {
      panel:
        'The Measure panel with a distance and its X, Y, Z deltas, and the line it measures on the box',
    },
    places: ['measure'],
  }),
  define({
    id: 'section-view',
    title: 'Section View: look inside the model',
    area: 'View',
    summary:
      'Cut the view with a horizontal plane to see what is inside, without changing the model.',
    keywords:
      'section view cut clip plane slice inside cross section inspect hide above z height cutaway',
    body: `Section View hides the part of the model above a horizontal plane, so you can see inside. It is for looking only: the geometry is not cut. The cut is closed over with a hatched face, as a section is drawn on paper, so you can tell material from air.

## Use it

1. Press **Section View** in the left rail, at the bottom, in Modeling. The rail button then reads **On**, and a panel opens. The plane starts through the middle of the model.
2. Set its height in the **Z position** field. Type a number and press Enter, or drag the number up and down.
3. Press **Center on model** to put the plane through the middle again, or **Reset to origin** to put it at zero.
4. Press the rail button again, or close the panel, to leave.

![](image:panel)

## The field

- Dragging moves the plane half a millimetre for each pixel. A click without moving lets you type.
- A value that is not a number is marked and not applied. Esc puts the old value back.
- The unit is the one set for the project.
- Only horizontal cuts exist: the plane is always parallel to the XY plane. To look from the side instead, use the [standard views](doc:standard-views).

> The model is unchanged and so are your exports. While you measure, the section's panel is hidden and the cut stays; leave Measure to bring the panel back. Section View exists only on screen. For a cut in a technical drawing, see [section A–A](doc:drawings-views).`,
    shots: { panel: 'The Section View panel with a cut through a box' },
    places: ['section-view'],
  }),
] as const;
