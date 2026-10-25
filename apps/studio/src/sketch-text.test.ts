/** Text in a sketch, with the font the app ships. Here and not in `@bezier/ui` for the file read. */

import { readFileSync } from 'node:fs';
import { emptySketch, parseFont, sketchAreas, textToSketch } from '@bezier/ui';
import { describe, expect, it } from 'vitest';

const bytes = readFileSync(new URL('../public/fonts/archivo-pdf-regular.ttf', import.meta.url));
const font = parseFont(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const notoBytes = readFileSync(new URL('../public/fonts/NotoSans-Regular.ttf', import.meta.url));
const noto = parseFont(
  notoBytes.buffer.slice(notoBytes.byteOffset, notoBytes.byteOffset + notoBytes.byteLength),
);

const areas = (text: string) =>
  sketchAreas(textToSketch(emptySketch(), font, text, { u: 0, v: 0 }, 10));

describe('text in a sketch', () => {
  it('reads the font the app ships', () => {
    expect(font.unitsPerEm).toBeGreaterThan(0);
    expect(font.glyphFor('A'.codePointAt(0) ?? 0)).toBeGreaterThan(0);
  });

  it('makes an H one area, an i two, and an O a ring round its counter', () => {
    expect(areas('H')).toHaveLength(1);
    expect(areas('i')).toHaveLength(2);
    // As a circle inside a rectangle: the ring, with the counter as its hole, and the counter.
    const o = areas('O');
    expect(o).toHaveLength(2);
    expect(o.filter((area) => area.holes.length === 1)).toHaveLength(1);
  });

  it('keeps the corners of a straight letter as lines and the curves of a round one as splines', () => {
    const straight = textToSketch(emptySketch(), font, 'L', { u: 0, v: 0 }, 10);
    expect(straight.primitives.some((p) => p.kind === 'spline')).toBe(false);
    const round = textToSketch(emptySketch(), font, 'o', { u: 0, v: 0 }, 10);
    expect(round.primitives.some((p) => p.kind === 'spline')).toBe(true);
  });

  it('is as tall as asked, from the baseline', () => {
    const sketch = textToSketch(emptySketch(), font, 'H', { u: 5, v: 2 }, 10);
    const ys = sketch.primitives.flatMap((p) => (p.kind === 'point' ? [p.y] : []));
    expect(Math.min(...ys)).toBeCloseTo(2, 1);
    // Cap height is about 0.7 em, which the size is measured against.
    expect(Math.max(...ys) - 2).toBeGreaterThan(8);
    expect(Math.max(...ys) - 2).toBeLessThan(12);
  });

  it('takes a letter the font lacks from the fallback, not as an empty box (audit F-007)', () => {
    const omega = 'Ω'.codePointAt(0) ?? 0;
    expect(font.glyphFor(omega)).toBe(0);
    expect(noto.glyphFor(omega)).toBeGreaterThan(0);
    const placed = textToSketch(emptySketch(), font, 'Ω', { u: 0, v: 0 }, 10, noto);
    // An Ω has curves; the empty box of a missing letter is four straight lines.
    expect(placed.primitives.some((p) => p.kind === 'spline')).toBe(true);
  });

  it('sets a second line under the first', () => {
    const two = textToSketch(emptySketch(), font, 'H\nH', { u: 0, v: 0 }, 10);
    const ys = two.primitives.flatMap((p) => (p.kind === 'point' ? [p.y] : []));
    expect(Math.min(...ys)).toBeCloseTo(-14, 1);
    expect(sketchAreas(two)).toHaveLength(2);
  });
});
