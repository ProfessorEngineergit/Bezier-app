/**
 * Hole styles, depths and targets against the real kernel. The box is 40 × 60 × 10, standing
 * on XY.
 */

import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import type { ConstraintSolver, Point2, SketchId } from '@bezier/solver';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CadDocument, createEmptyDocument } from '../document.js';
import { rebuild } from '../rebuild/rebuild.js';
import type { FeatureRecord } from './types.js';

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

function box(): FeatureRecord[] {
  const corners = ['p0', 'p1', 'p2', 'p3'];
  return [
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
  ];
}

/**
 * The name of the box's top face. Found by asking: an extrude's cap and side tags follow
 * the kernel's face order and `end` is not guaranteed to be the top.
 */
let TOP = '';

function withHole(params: Record<string, unknown>): CadDocument {
  return {
    ...createEmptyDocument('Holes', () => new Date('2026-09-27T12:00:00.000Z')),
    features: [
      ...box(),
      {
        id: 'hole-1',
        type: 'hole',
        name: 'Hole',
        params: { faces: [TOP], x: 20, y: 30, diameter: 6, ...params },
      },
    ],
  };
}

describe('hole', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
    const plain = await rebuild(
      { ...createEmptyDocument('Box', () => new Date(0)), features: box() },
      { kernel, solver },
    );
    for (const name of plain.naming.knownNames()) {
      const face = plain.naming.faceFor(name);
      const plane = face === null ? null : await kernel.facePlane(face);
      if (plane?.ok === true && plane.value.normal.z > 0.99) TOP = name;
    }
    if (TOP === '') throw new Error('no top face');
  }, 120_000);

  const faces = async (document: CadDocument) => {
    const result = await rebuild(document, { kernel, solver });
    expect(result.statuses.get('hole-1')).toEqual({ state: 'ok' });
    if (result.body === null) throw new Error('no body');
    const described = await kernel.describeFaces(result.body);
    if (!described.ok) throw new Error(described.error.message);
    const kinds = described.value.map((face) => face.surfaceType).sort();
    return { count: described.value.length, kinds };
  };

  it('drills a blind hole with a floor', async () => {
    // Six box faces, the bore wall and the floor of the hole.
    expect((await faces(withHole({ depth: 4 }))).count).toBe(8);
  });

  it('drills through everything, leaving no floor', async () => {
    expect((await faces(withHole({ through: true }))).count).toBe(7);
  });

  it('counterbores: a wider, shallow step at the top', async () => {
    const result = await faces(
      withHole({ through: true, style: 'counterbore', headDiameter: 11, headDepth: 3 }),
    );
    // Box, bore wall, head wall, and the ledge between them.
    expect(result.count).toBe(9);
  });

  it('countersinks: a cone at the top', async () => {
    const result = await faces(
      withHole({ through: true, style: 'countersink', headDiameter: 12, sinkAngle: 90 }),
    );
    expect(result.count).toBe(8);
    expect(result.kinds).toContain('cone');
  });

  it('refuses a head no wider than the hole, in words', async () => {
    const result = await rebuild(withHole({ style: 'counterbore', headDiameter: 5 }), {
      kernel,
      solver,
    });
    expect(result.statuses.get('hole-1')).toEqual({
      state: 'failed',
      message: 'The head of the hole must be wider than the hole.',
    });
  });
});
