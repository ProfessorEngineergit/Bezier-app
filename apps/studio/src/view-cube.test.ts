/**
 * The view cube is built in TypeScript (`view-cube-geometry.ts`) and placed by CSS; this keeps
 * their sizes in sync.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CUBE_HALF } from './ViewCube.js';

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
});
