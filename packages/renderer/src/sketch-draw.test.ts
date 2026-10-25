/**
 * Sketch line width is in screen pixels: the ribbon is built from the world size of one pixel, so
 * lines keep their weight relative to vertex dots at any zoom.
 */

import type { PlaneBasis } from '@bezier/core';
import type { Sketch, SketchId } from '@bezier/solver';
import type { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { createSketchDraw, type SketchDraw } from './sketch-draw.js';

const XY: PlaneBasis = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
  yDirection: { x: 0, y: 1, z: 0 },
};

const id = (name: string) => name as unknown as SketchId;

/** One line along the plane's x axis, so its ribbon spreads along y. */
const line: Sketch = {
  primitives: [
    { kind: 'point', id: id('a'), x: 0, y: 0 },
    { kind: 'point', id: id('b'), x: 10, y: 0 },
    { kind: 'line', id: id('l'), start: id('a'), end: id('b') },
  ],
  constraints: [],
};

/**
 * How wide the drawn ribbon is, in world units. The committed lines are the second child (fill,
 * lines, pending, selected, vertices) and the line runs along x, so the ribbon's whole spread in y
 * is its width.
 */
function width(draw: SketchDraw): number {
  const mesh = draw.group.children[1] as Mesh;
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  return box === null ? 0 : box.max.y - box.min.y;
}

describe('a sketch keeps its weight as the camera moves', () => {
  it('widens in world units exactly as a pixel comes to cover more world', () => {
    const draw = createSketchDraw();
    draw.setScale(0.1);
    draw.set(XY, line, [], new Set());
    const near = width(draw);
    expect(near).toBeGreaterThan(0);

    // Zoomed out: a pixel is worth twice the world, so the ribbon has to be twice as wide in world
    // units to look the same on screen.
    draw.setScale(0.2);
    expect(width(draw)).toBeCloseTo(near * 2, 6);
  });

  it('ignores a change too small to see, rather than rebuilding every frame', () => {
    const draw = createSketchDraw();
    draw.setScale(0.2);
    draw.set(XY, line, [], new Set());
    const before = width(draw);

    draw.setScale(0.204);
    expect(width(draw)).toBeCloseTo(before, 10);
  });

  it('refuses a scale that is not a positive number', () => {
    const draw = createSketchDraw();
    draw.setScale(0.1);
    draw.set(XY, line, [], new Set());
    const before = width(draw);

    draw.setScale(0);
    draw.setScale(Number.NaN);
    expect(width(draw)).toBeCloseTo(before, 10);
  });
});
