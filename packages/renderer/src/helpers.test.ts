import { describe, expect, it } from 'vitest';
import { createHelpers } from './helpers.js';

describe('world axes', () => {
  it('carries both halves of every axis, all six starting at the origin', () => {
    // Both halves of each axis live in the buffer; the shader shows the negative one only for the
    // axis under the pointer, so the reveal is a uniform and not a rebuild every frame.
    const helpers = createHelpers();
    const positions = helpers.axes.geometry.getAttribute('position');

    expect(positions.count).toBe(12);
    for (let segment = 0; segment < 6; segment++) {
      const start = segment * 2;
      expect([positions.getX(start), positions.getY(start), positions.getZ(start)]).toEqual([
        0, 0, 0,
      ]);
    }

    // Positive then negative, X then Y then Z.
    expect(positions.getX(1)).toBeGreaterThan(0);
    expect(positions.getX(3)).toBeLessThan(0);
    expect(positions.getY(5)).toBeGreaterThan(0);
    expect(positions.getY(7)).toBeLessThan(0);
    expect(positions.getZ(9)).toBeGreaterThan(0);
    expect(positions.getZ(11)).toBeLessThan(0);

    helpers.dispose();
  });

  it('labels each vertex with its axis and which half it is on', () => {
    // The shader reads both to decide what to hide, so a mismatch here would reveal the wrong half
    // or hide a positive one, which is the visible half.
    const helpers = createHelpers();
    const axis = helpers.axes.geometry.getAttribute('axis');
    const negative = helpers.axes.geometry.getAttribute('negative');

    expect(Array.from(axis.array)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]);
    expect(Array.from(negative.array)).toEqual([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]);

    helpers.dispose();
  });
});
