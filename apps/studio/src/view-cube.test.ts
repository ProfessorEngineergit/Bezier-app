/**
 * The view cube is built in TypeScript (`view-cube-geometry.ts`) and placed by CSS; this keeps
 * their sizes in sync.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CUBE_HALF } from './ViewCube.js';
import { CANVAS_MARGIN, CANVAS_SIZE } from './view-cube-canvas.js';
import { AXIS_PARTS } from './view-cube-model.js';

const TOKENS = readFileSync(
  new URL('../../../packages/ui/src/tokens.css', import.meta.url),
  'utf8',
);

/** The first declaration of a token, in pixels. */
function pixels(name: string): number {
  const match = new RegExp(`${name}:\\s*(-?[\\d.]+)px`).exec(TOKENS);
  expect(match, `${name} should be declared in tokens.css`).not.toBeNull();
  return Number(match?.[1]);
}

describe('the view cube agrees with its stylesheet', () => {
  it('builds its faces at the size CSS gives the cube', () => {
    expect(CUBE_HALF).toBe(pixels('--cube-half'));
  });

  it('keeps the cube half at exactly half its edge', () => {
    expect(pixels('--cube-half') * 2).toBe(pixels('--cube-size'));
  });

  it('paints on a canvas the size CSS shows it', () => {
    expect(CANVAS_MARGIN).toBe(pixels('--cube-margin'));
  });

  it('has room for every axis letter at any camera angle', () => {
    const glyph = 7;
    const perspective = pixels('--cube-perspective');
    for (const part of AXIS_PARTS) {
      const [x, y, z] = part.labelAt;
      // The letter's distance from the middle, turned straight across the view, and as near the
      // camera as the same distance lets it come (`project` in view-cube-canvas.ts).
      const reach = Math.hypot(x, y, z);
      const nearest = perspective / (perspective - Math.SQRT1_2 * reach);
      expect(reach * Math.SQRT1_2 * nearest + glyph).toBeLessThan(CANVAS_SIZE / 2);
      expect(reach + glyph).toBeLessThan(CANVAS_SIZE / 2);
    }
  });
});
