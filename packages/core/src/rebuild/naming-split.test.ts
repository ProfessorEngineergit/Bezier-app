/**
 * Names on faces that an operation split in two, against the real kernel. The piece that answers
 * must not depend on kernel hash order. The box is 40 × 60 × 10, standing on XY.
 */

import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import type { ConstraintSolver, Point2, SketchId } from '@bezier/solver';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CadDocument, createEmptyDocument } from '../document.js';
import type { FeatureRecord } from '../features/types.js';
import { parseRef } from '../stable-ref.js';
import { rebuild } from './rebuild.js';

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

/** Names found by asking (an extrude's tags follow the kernel's face order). */
let SIDE = '';
let TOP = '';

describe('a face split in two', () => {
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
      if (plane?.ok === true && plane.value.normal.x > 0.99) SIDE = name;
      if (plane?.ok === true && plane.value.normal.z > 0.99) TOP = name;
    }
  }, 120_000);

  const split = (): CadDocument => ({
    ...createEmptyDocument('Split', () => new Date(0)),
    features: [
      ...box(),
      {
        id: 'split-1',
        type: 'split-body',
        name: 'Split',
        params: { faces: [TOP], plane: 'XY', offset: 5 },
      },
    ],
  });

  it('answers to its name with the same piece every rebuild', async () => {
    const heights: number[] = [];
    for (let round = 0; round < 3; round += 1) {
      const result = await rebuild(split(), { kernel, solver });
      const face = await result.naming.resolve(kernel, parseRef(SIDE));
      if (face === null) throw new Error('side does not resolve');
      const measured = await kernel.measureFaces([face]);
      if (!measured.ok) throw new Error(measured.error.message);
      heights.push(Math.round(measured.value[0]?.centre.z ?? -1));
    }
    expect(new Set(heights).size).toBe(1);
  });

  it('finds an edge on whichever piece has it', async () => {
    const base = split();
    const document: CadDocument = {
      ...base,
      features: [
        ...base.features,
        {
          id: 'fillet-1',
          type: 'fillet',
          name: 'Fillet',
          params: { edges: [`E(${TOP}|${SIDE})`], radius: 1 },
        },
      ],
    };
    const result = await rebuild(document, { kernel, solver });
    expect(result.statuses.get('fillet-1')).toEqual({ state: 'ok' });
  });
});
