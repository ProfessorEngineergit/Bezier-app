/** Measurement and annotation collision rules are independent of camera zoom. */
import { expect, it } from 'vitest';
import { layoutDimensions, measuredDimension, snapDrawing } from './drawing-dimensions.js';
import type { SheetDimension, SheetView } from './drawing-sheet.js';

const view: SheetView = {
  name: 'top',
  x: 50,
  y: 50,
  scale: 2,
  vertices: [],
  lines: [{ points: [30, 30, 70, 30, 70, 70, 30, 70, 30, 30], hidden: false }],
};
it('separates repeated dimension labels from the model and the view caption', () => {
  const dimensions: SheetDimension[] = Array.from({ length: 4 }, () => ({
    a: [30, 70],
    b: [70, 70],
    text: '20',
    view: 'top',
  }));
  const placed = layoutDimensions(dimensions, [view]);
  for (let i = 0; i < placed.length; i++) {
    const current = placed[i];
    expect(current?.box.minY).toBeGreaterThan(80);
    for (let j = 0; j < i; j++)
      expect((current?.box.minY ?? 0) - (placed[j]?.box.maxY ?? 0)).toBeGreaterThan(1);
  }
});
it('honours user placement and scaled horizontal / vertical measurements', () => {
  const d: SheetDimension = {
    a: [30, 30],
    b: [70, 70],
    text: 'custom',
    offset: -18,
    along: 5,
    view: 'top',
  };
  expect(layoutDimensions([d], [view])[0]?.offset).toBe(-18);
  const a = { point: d.a, view: 'top' },
    b = { point: d.b, view: 'top' };
  expect(measuredDimension(a, b, view, 'horizontal')?.measured).toBe(20);
  expect(measuredDimension(a, b, view, 'vertical')?.measured).toBe(20);
  expect(measuredDimension(a, b, view, 'aligned')?.measured).toBeCloseTo(Math.sqrt(800));
  expect(measuredDimension(a, { ...b, view: 'right' }, view, 'aligned')).toBeNull();
});
it('uses exact 3D positions in isometric views and refuses unproven outline points', () => {
  const iso: SheetView = {
    ...view,
    name: 'isometric',
    lines: [{ points: [30, 30, 46.33, 30], hidden: false }],
    vertices: [
      { point: [30, 30], world: { x: 0, y: 0, z: 0 }, depth: 0 },
      { point: [46.33, 30], world: { x: 10, y: 0, z: 0 }, depth: 5 },
    ],
  };
  const a = snapDrawing([iso], 30, 30, 1),
    b = snapDrawing([iso], 46.33, 30, 1);
  if (!a || !b) throw new Error('Missing exact vertices');
  expect(measuredDimension(a, b, iso, 'aligned')?.measured).toBe(10);
  expect(snapDrawing([{ ...iso, vertices: [] }], 30, 30, 1)).toBeNull();
});
