/**
 * A sketch standing off its plane: a construction plane parallel to it, and the part built
 * from the sketch starts there. Against the real kernel.
 */

import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import type { ConstraintSolver, Point2, SketchId } from '@bezier/solver';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CadDocument, createEmptyDocument } from '../document.js';
import { apply } from '../journal/journal.js';
import type { Operation } from '../journal/operations.js';
import { rebuild } from '../rebuild/rebuild.js';

const solver: ConstraintSolver = {
  solve: () => ({
    status: 'solved',
    positions: new Map<SketchId, Point2>([
      ['p0', { x: 0, y: 0 }],
      ['p1', { x: 40, y: 0 }],
      ['p2', { x: 40, y: 60 }],
      ['p3', { x: 0, y: 60 }],
    ]),
    radii: new Map(),
    dof: 0,
    conflicting: [],
    redundant: [],
  }),
  dispose() {},
};

function part(): CadDocument {
  const corners = ['p0', 'p1', 'p2', 'p3'];
  return {
    ...createEmptyDocument('Test', () => new Date('2026-09-27T12:00:00.000Z')),
    features: [
      {
        id: 'sketch-1',
        type: 'sketch',
        name: 'Sketch',
        params: {
          plane: 'XY',
          sketch: {
            primitives: [
              ...corners.map((id) => ({ kind: 'point' as const, id, x: 0, y: 0 })),
              ...corners.map((id, i) => ({
                kind: 'line' as const,
                id: `l${i}`,
                start: id,
                end: corners[(i + 1) % 4] as SketchId,
              })),
            ],
            constraints: [],
          },
        },
      },
      {
        id: 'extrude-1',
        type: 'extrude',
        name: 'Extrude',
        params: { sketch: 'sketch-1', distance: 10, direction: 'forward', operation: 'new' },
      },
    ],
  };
}

function run(document: CadDocument, ...ops: Operation[]): CadDocument {
  return ops.reduce((current, op) => {
    const result = apply(current, op);
    if (!result.ok) throw new Error(result.reason);
    return result.document;
  }, document);
}

describe('a sketch with an offset', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, 120_000);

  const span = async (document: CadDocument) => {
    const result = await rebuild(document, { kernel, solver });
    const positions = result.mesh?.positions ?? new Float32Array();
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (let i = 2; i < positions.length; i += 3) {
      low = Math.min(low, positions[i] ?? low);
      high = Math.max(high, positions[i] ?? high);
    }
    return { low, high, basis: result.sketches.get('sketch-1')?.basis };
  };

  it('stands off its plane along the normal, and the part starts there', async () => {
    const document = part();
    const [sketch, extrude] = document.features;
    if (sketch === undefined || extrude === undefined) throw new Error('no part');
    const lifted = {
      ...document,
      features: [{ ...sketch, params: { ...sketch.params, offset: 25 } }, extrude],
    };
    const { low, high, basis } = await span(lifted);
    expect(low).toBeCloseTo(25);
    expect(high).toBeCloseTo(35);
    expect(basis?.origin.z).toBeCloseTo(25);
  });

  it('takes its offset from a variable', async () => {
    const driven = run(
      part(),
      { op: 'setVariable', name: 'lift', expression: '2 cm' },
      { op: 'setExpression', id: 'sketch-1', param: 'offset', expression: 'lift' },
    );
    expect((await span(driven)).low).toBeCloseTo(20);
  });

  it('tilts about its own x axis: at 45° the part leans halfway between the ground and a wall', async () => {
    const document = part();
    const [sketch, extrude] = document.features;
    if (sketch === undefined || extrude === undefined) throw new Error('no part');
    const tilted = {
      ...document,
      features: [{ ...sketch, params: { ...sketch.params, tilt: Math.PI / 4 } }, extrude],
    };
    const { low, high, basis } = await span(tilted);
    const half = Math.SQRT1_2;
    expect(basis?.normal.y).toBeCloseTo(-half);
    expect(basis?.normal.z).toBeCloseTo(half);
    expect(basis?.yDirection.z).toBeCloseTo(half);
    // The 60 mm side rises at 45° and the 10 mm extrusion along the tilted normal adds its share.
    expect(high).toBeCloseTo(60 * half + 10 * half);
    expect(low).toBeCloseTo(0);
  });

  it('turns about its own y after the tilt, reaching any direction', async () => {
    const document = part();
    const [sketch, extrude] = document.features;
    if (sketch === undefined || extrude === undefined) throw new Error('no part');
    const turned = {
      ...document,
      features: [{ ...sketch, params: { ...sketch.params, turn: Math.PI / 2 } }, extrude],
    };
    const { basis } = await span(turned);
    // XY turned a quarter about its y faces along +X, with its x pointing down.
    expect(basis?.normal.x).toBeCloseTo(1);
    expect(basis?.xDirection.z).toBeCloseTo(-1);
  });

  it('reads a sketch saved without one as standing on its plane', async () => {
    expect((await span(part())).low).toBeCloseTo(0);
  });
});
