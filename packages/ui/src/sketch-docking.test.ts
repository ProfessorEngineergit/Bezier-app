import type { PlaneBasis } from '@bezier/core';
import type { Sketch } from '@bezier/solver';
import { describe, expect, it } from 'vitest';
import { dockingFrom, dockOn } from './sketch-docking.js';
import { snapCandidate } from './sketch-tools.js';

const XY: PlaneBasis = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
  yDirection: { x: 0, y: 1, z: 0 },
};
const lifted = (z: number): PlaneBasis => ({ ...XY, origin: { x: 0, y: 0, z } });

/** A 20 by 10 rectangle with its corner at (40, 0), and a circle of 3 round (70, 5). */
const neighbour: Sketch = {
  primitives: [
    { kind: 'point', id: 'a', x: 40, y: 0 },
    { kind: 'point', id: 'b', x: 60, y: 0 },
    { kind: 'point', id: 'c', x: 60, y: 10 },
    { kind: 'point', id: 'd', x: 40, y: 10 },
    { kind: 'line', id: 'ab', start: 'a', end: 'b' },
    { kind: 'line', id: 'bc', start: 'b', end: 'c' },
    { kind: 'line', id: 'cd', start: 'c', end: 'd' },
    { kind: 'line', id: 'da', start: 'd', end: 'a' },
    { kind: 'point', id: 'k', x: 70, y: 5 },
    { kind: 'circle', id: 'circle', center: 'k', radius: 3 },
  ],
  constraints: [],
};
const empty: Sketch = { primitives: [], constraints: [] };

describe('drawing onto another sketch', () => {
  const docking = dockingFrom([{ plane: XY, sketch: neighbour }], XY);

  it('lands on its corners, its centres, the middles of its lines and on its lines', () => {
    expect(dockOn(docking, { u: 40.6, v: 0.4 }, 1)).toEqual({
      at: { u: 40, v: 0 },
      kind: 'endpoint',
    });
    expect(dockOn(docking, { u: 70.3, v: 4.8 }, 1)).toEqual({
      at: { u: 70, v: 5 },
      kind: 'centre',
    });
    expect(dockOn(docking, { u: 50.2, v: 0.5 }, 1)).toEqual({
      at: { u: 50, v: 0 },
      kind: 'midpoint',
    });
    expect(dockOn(docking, { u: 45, v: 10.6 }, 1)).toEqual({ at: { u: 45, v: 10 }, kind: 'edge' });
    expect(dockOn(docking, { u: 20, v: 20 }, 1)).toBeNull();
  });

  it('is part of where a drawn point snaps, after the drawing itself and before the grid', () => {
    expect(snapCandidate(empty, { u: 59.5, v: 9.6 }, 1, 5, docking)).toEqual({
      at: { u: 60, v: 10 },
      kind: 'endpoint',
    });
    expect(snapCandidate(empty, { u: 52, v: 10.4 }, 1, 5, docking)).toEqual({
      at: { u: 52, v: 10 },
      kind: 'edge',
    });
    expect(snapCandidate(empty, { u: 21, v: 22 }, 1, 5, docking).kind).toBe('grid');
  });

  it('leaves out sketches that are not in the plane being drawn on', () => {
    expect(dockingFrom([{ plane: lifted(5), sketch: neighbour }], XY).points).toEqual([]);
    // The same sketch seen from a plane it does lie in: five points and four middles.
    expect(dockingFrom([{ plane: lifted(5), sketch: neighbour }], lifted(5)).points.length).toBe(9);
  });
});
