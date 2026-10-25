/**
 * Nib's guided lessons. The first builds a part from scratch: sketch a rectangle, extrude it, round
 * an edge. The others introduce one workspace each and are offered the first time it opens
 * (`FIRST_IN`). Each step waits for the editor to report an edit by journal operation (`addFeature`
 * of a feature type), so completion is exact and independent of the UI. Every step can be skipped.
 */

import type { Guide } from '@bezier/nib';

const rail = (text: string) => ({ selector: '.rail__icon', text });

export const FIRST_PART: Guide = {
  id: 'first-part',
  title: 'Your first part',
  steps: [
    {
      say: "Let's make a part. First, a new project.",
      at: { selector: 'button', text: 'New Project' },
      // The editor is always mounted behind the start page, so wait for the start page to go.
      wait: { gone: '.library' },
      hint: { after: 12, say: 'The New Project button is right here. I will wait.' },
    },
    {
      // A part starts as a sketch, as in every CAD tool.
      say: 'Every part starts as a drawing. Open Sketch.',
      at: rail('Sketch'),
      wait: { click: rail('Sketch') },
      arrive: 'wave',
      hint: { after: 12, say: 'Sketch is the top tool in the rail on the left.' },
    },
    {
      say: 'Click the grid: that is the floor you draw on.',
      at: 'canvas.viewport',
      ring: false,
      wait: { gone: { selector: '.rail__detail', text: 'No active plane' } },
      hint: { after: 12, say: 'Anywhere on the grid in the middle.' },
    },
    {
      say: 'Press Rectangle, then click two corners on the grid.',
      at: rail('Rectangle'),
      wait: { present: 'input[aria-label^="Length for sketch line"]' },
      hint: {
        after: 16,
        say: 'R picks the rectangle too. Click once for a corner, again for the other.',
      },
    },
    {
      say: 'A drawing. Press Finish Sketch.',
      at: rail('Finish Sketch'),
      wait: { click: rail('Finish Sketch') },
      arrive: 'nod',
    },
    {
      say: 'Click inside the rectangle, then drag the arrow up to give it height.',
      at: 'canvas.viewport',
      ring: false,
      wait: { edit: { op: 'addFeature', type: 'extrude' } },
      hint: {
        after: 16,
        say: 'The filled shape is the button. Drag the arrow, or type a height and press Enter.',
      },
    },
    {
      say: 'A body. Now click one of its edges. It lights up.',
      at: 'canvas.viewport',
      ring: false,
      wait: { present: '.edge-gizmo' },
      arrive: 'nod',
      hint: { after: 14, say: 'The edges are the lines where two faces meet. Try the top one.' },
    },
    {
      // On the edge itself: the handle and radius appear when it is picked, and the rail's
      // Chamfer/Fillet is in a flyout this lesson never opens.
      say: 'Round it: drag the blue handle, or click the radius and type 3.',
      at: '.edge-gizmo',
      wait: { edit: { op: 'addFeature', type: 'fillet' } },
      hint: {
        after: 14,
        say: 'The small handle on the edge. Pull it, or press Enter after a number.',
      },
    },
    {
      say: 'That is a part. Every step is kept: change the extrude later and the round follows. Items lists them.',
      at: rail('Items'),
      choices: [{ label: 'Nice', go: 'next' }],
      arrive: 'juhu',
      done: 'cheer',
    },
  ],
};

const tab = (text: string) => ({ selector: '[role="tab"], button', text });

/** Visualize: three settings, then a rendered picture. */
export const VISUALIZE: Guide = {
  id: 'visualize',
  title: 'Pictures of your part',
  steps: [
    {
      say: 'Visualize makes pictures of your part, to show people. Nothing here changes the model.',
      at: '.viz-inspector',
      ring: false,
      choices: [{ label: 'Go on', go: 'next' }],
      arrive: 'wave',
    },
    {
      say: 'Give it a material: click one in the list. Wood, metal, glass, all of it.',
      at: '.viz-library',
      wait: { click: '.viz-library' },
      hint: { after: 14, say: 'The round swatches on the right. Any one will do.' },
    },
    {
      say: 'Environment is the light around it and what it stands in front of.',
      at: tab('Environment'),
      wait: { click: tab('Environment') },
      hint: { after: 12, say: 'Environment is the second tab at the top of the panel.' },
    },
    {
      say: 'Turn the view until it looks right, then Capture saves the picture at full size.',
      at: '.viz__primary',
      wait: { click: '.viz__primary' },
      hint: { after: 20, say: 'Capture is the dark button above the picture.' },
      done: 'juhu',
    },
  ],
};

/** Drawings: the part on a sheet, a dimension, and PDF export. */
export const DRAWINGS: Guide = {
  id: 'drawings',
  title: 'A drawing of your part',
  steps: [
    {
      say: 'Drawings lays your part out on a sheet: from the front, the top, the side and in 3D, ready to print.',
      at: '.dwg__desk',
      ring: false,
      choices: [{ label: 'Go on', go: 'next' }],
      arrive: 'wave',
    },
    {
      say: 'Add a measure: press Dimension, then click two corners in one of the views.',
      at: { selector: 'button', text: 'Dimension' },
      wait: { present: '.dwg-dimension' },
      hint: {
        after: 20,
        say: 'Two points in the same view, then the number appears. Drag it where it reads best.',
      },
    },
    {
      say: 'Change the model and the sheet follows: Update from model takes the newest version.',
      at: { selector: 'button', text: 'Update from model' },
      choices: [{ label: 'Go on', go: 'next' }],
    },
    {
      say: 'Export Sheet makes a PDF or a DXF of it.',
      at: '.dwg-primary',
      choices: [{ label: 'Got it', go: 'next' }],
      done: 'juhu',
    },
  ],
};

const simRail = (text: string) => ({ selector: '.rail__icon', text });
const done = { selector: '.sim-editor button', text: 'Done' };

/** Simulation: fix it, load it, solve, read the colours. */
export const SIMULATION: Guide = {
  id: 'simulation',
  title: 'Will it hold?',
  steps: [
    {
      say: 'Simulation shows how your part bends under load. It needs two things: where it is held, and what pushes on it.',
      at: '.sim-bar',
      ring: false,
      choices: [{ label: 'Go on', go: 'next' }],
      arrive: 'wave',
    },
    {
      say: 'Where is it held? Press Fixed and click that face.',
      at: simRail('Fixed'),
      // Fixed has nothing to set, so no Done step: placing it is enough.
      wait: { present: '.sim-editor[aria-label="Fixed"]' },
      hint: {
        after: 20,
        say: 'Fixed is the top tool on the left. A face turns blue when it is chosen.',
      },
    },
    {
      say: 'Now push on it: press Force, click the face it pushes on, then Done.',
      at: simRail('Force'),
      wait: { click: done },
      hint: { after: 20, say: 'Force is in the second group on the left. 100 N to start with.' },
    },
    {
      say: 'Press Solve. It takes a few seconds.',
      at: '.sim-solve',
      wait: { present: '.sim-legend' },
      hint: { after: 30, say: 'Still working. A finer mesh takes longer.' },
    },
    {
      say: 'Red is where it works hardest, blue where it is at ease. Point at the part to read the number there.',
      at: '.sim-legend',
      choices: [{ label: 'Got it', go: 'next' }],
      done: 'juhu',
    },
  ],
};

/** The lesson offered the first time each workspace opens. */
export const FIRST_IN: Readonly<Record<string, { guide: Guide; offer: string }>> = {
  design: {
    guide: FIRST_PART,
    offer: 'Your first project. Shall I show you how a part is made? I point, you click.',
  },
  visualize: {
    guide: VISUALIZE,
    offer: 'First time in Visualize. Shall I show you how to make a picture of your part?',
  },
  drawings: {
    guide: DRAWINGS,
    offer: 'First time in Drawings. Shall I show you how a sheet is made?',
  },
  simulation: {
    guide: SIMULATION,
    offer: 'First time in Simulation. Shall I show you how to test your part?',
  },
};

/** A lesson as listed in the island and settings: its guide and rough duration. */
export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  guide: Guide;
}

/** Every lesson, in the order a newcomer would take them. */
export const LESSONS: readonly Lesson[] = [
  { id: FIRST_PART.id, title: FIRST_PART.title, minutes: 2, guide: FIRST_PART },
  { id: VISUALIZE.id, title: VISUALIZE.title, minutes: 2, guide: VISUALIZE },
  { id: DRAWINGS.id, title: DRAWINGS.title, minutes: 3, guide: DRAWINGS },
  { id: SIMULATION.id, title: SIMULATION.title, minutes: 3, guide: SIMULATION },
];

/** The lesson an offer is about, by its wording; null for anything else he says. */
/** The greeting on the app's first open, offering the first lesson (`first-offers.ts`). */
export const GREETING =
  "Hi, I'm Nib. Let me show you around: we'll make a first part together. If you'd rather look first, I wait at the top of the window.";

export function lessonFor(offer: string): Lesson | null {
  if (offer === GREETING) return LESSONS.find((lesson) => lesson.guide === FIRST_PART) ?? null;
  const entry = Object.values(FIRST_IN).find((first) => first.offer === offer);
  return entry === undefined
    ? null
    : (LESSONS.find((lesson) => lesson.guide === entry.guide) ?? null);
}
