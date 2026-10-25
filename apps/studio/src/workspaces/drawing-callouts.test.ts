import { describe, expect, it } from 'vitest';
import { detailCallout, sectionCallout } from './drawing-callouts.js';
import type { SheetView } from './drawing-sheet.js';

/** A 40 × 20 × 15 block at scale 2: front view 80 × 30 centred on (100, 60), top 80 × 40 on (100, 150). */
const layout: SheetView[] = [
  {
    name: 'front',
    x: 100,
    y: 60,
    scale: 2,
    vertices: [],
    lines: [{ hidden: false, points: [60, 45, 140, 45, 140, 75, 60, 75, 60, 45] }],
  },
  {
    name: 'top',
    x: 100,
    y: 150,
    scale: 2,
    // The corner at the origin sits at the view's lower left.
    vertices: [{ point: [60, 170], world: { x: 0, y: 0, z: 0 }, depth: 0 }],
    lines: [{ hidden: false, points: [60, 130, 140, 130, 140, 170, 60, 170, 60, 130] }],
  },
];

describe('drawing callouts (audit F-020)', () => {
  it('marks a level cut across the front view at its share of the height', () => {
    const cut = sectionCallout(layout, 0.5);
    expect(cut?.from).toEqual([54, 60]);
    expect(cut?.to).toEqual([146, 60]);
    expect(sectionCallout(layout, null)).toBeNull();
  });

  it('puts the detail circle where it is in the top view', () => {
    const circle = detailCallout(layout, { on: true, x: 40, y: 20, radius: 5 });
    expect(circle).toEqual({ centre: [140, 130], radius: 10 });
    expect(detailCallout(layout, { on: false, x: 0, y: 0, radius: 5 })).toBeNull();
  });
});
