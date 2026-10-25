import { expect, it } from 'vitest';
import { drawingDesk } from './drawing-desk.js';
import { newSheet } from './drawing-sheets.js';

it('places four sheets in two rows without overlapping mixed paper formats', () => {
  const sheets = Array.from({ length: 4 }, (_, i) => newSheet('Assembly', i + 1));
  const second = sheets[1],
    third = sheets[2];
  if (!second || !third) throw new Error('Missing sheets');
  second.options.format = 'A2';
  third.options.format = 'A4';
  const { plates, width, height } = drawingDesk(sheets);
  const [a, b, c, d] = plates;
  if (!a || !b || !c || !d) throw new Error('Missing plates');
  expect(a.x).toBe(c.x);
  expect(a.y).toBe(b.y);
  expect(b.x).toBe(d.x);
  expect(c.y).toBe(d.y);
  expect(b.x).toBeGreaterThan(a.x + a.width);
  expect(c.y).toBeGreaterThan(Math.max(a.height, b.height));
  expect(width).toBeGreaterThanOrEqual(b.x + b.width);
  expect(height).toBeGreaterThanOrEqual(d.y + d.height);
});
