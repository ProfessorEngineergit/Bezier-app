/**
 * A sketch with an ellipse, and one with a spline, extruded through the whole rebuild: the real
 * solver, the real kernel.
 */

import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { type ConstraintSolver, createSolver, type SketchPrimitive } from '@bezier/solver';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CadDocument, createEmptyDocument } from '../document.js';
import { rebuild } from '../rebuild/rebuild.js';

function part(primitives: SketchPrimitive[]): CadDocument {
  return {
    ...createEmptyDocument('Test', () => new Date('2026-10-15T12:00:00.000Z')),
    features: [
      {
        id: 'sketch-1',
        type: 'sketch',
        name: 'Sketch',
        params: { plane: 'XY', sketch: { primitives, constraints: [] } },
      },
      {
        id: 'extrude-1',
        type: 'extrude',
        name: 'Extrude',
        params: { sketch: 'sketch-1', distance: 5, direction: 'forward', operation: 'new' },
      },
    ],
  };
}

describe('extruding curves', () => {
  let kernel: GeometryKernel;
  let solver: ConstraintSolver;
  beforeAll(async () => {
    kernel = await createOcctKernel();
    solver = await createSolver();
  }, 120_000);

  const span = async (document: CadDocument) => {
    const result = await rebuild(document, { kernel, solver });
    expect([...result.statuses.values()].every((status) => status.state === 'ok')).toBe(true);
    const positions = result.mesh?.positions ?? new Float32Array();
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 1) {
      const axis = i % 3;
      low[axis] = Math.min(low[axis] ?? 0, positions[i] ?? 0);
      high[axis] = Math.max(high[axis] ?? 0, positions[i] ?? 0);
    }
    return { low, high };
  };

  it('builds an elliptical cylinder', async () => {
    const { low, high } = await span(
      part([
        { kind: 'point', id: 'c', x: 0, y: 0 },
        { kind: 'point', id: 'v', x: 10, y: 0 },
        { kind: 'ellipse', id: 'e', center: 'c', vertex: 'v', minor: 4 },
      ]),
    );
    expect(high[0]).toBeCloseTo(10, 1);
    expect(low[1]).toBeCloseTo(-4, 1);
    expect(high[2]).toBeCloseTo(5);
  });

  it('builds a part with a curved spline side', async () => {
    const { high } = await span(
      part([
        { kind: 'point', id: 'a', x: 0, y: 0 },
        { kind: 'point', id: 'm', x: 5, y: 6 },
        { kind: 'point', id: 'b', x: 10, y: 0 },
        { kind: 'spline', id: 's', points: ['a', 'm', 'b'] },
        { kind: 'line', id: 'l', start: 'b', end: 'a' },
      ]),
    );
    // The spline passes through its middle point.
    expect(high[1]).toBeGreaterThanOrEqual(6 - 1e-3);
    expect(high[2]).toBeCloseTo(5);
  });
});
