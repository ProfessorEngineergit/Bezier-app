/**
 * Split along a face and along a tipped plane, against the real kernel. The box is
 * 40 × 60 × 10, standing on XY.
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

/** The top face's name, found by asking (an extrude's tags follow the kernel's face order). */
let TOP = '';

function split(params: Record<string, unknown>): CadDocument {
  return {
    ...createEmptyDocument('Split', () => new Date(0)),
    features: [
      ...box(),
      {
        id: 'split-1',
        type: 'split-body',
        name: 'Split',
        params: { faces: [TOP], plane: 'XY', offset: 0, ...params },
      },
    ],
  };
}

describe('split', () => {
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

  /** The height range of each piece, lowest first. */
  const pieces = async (document: CadDocument) => {
    const result = await rebuild(document, { kernel, solver });
    expect(result.statuses.get('split-1')).toEqual({ state: 'ok' });
    if (result.body === null) throw new Error('no body');
    // One group of faces per solid; a piece's height is the span of its faces.
    const groups = await kernel.solidFaceGroups(result.body);
    const faces = await kernel.describeFaces(result.body);
    if (!groups.ok || !faces.ok) throw new Error('could not read the pieces');
    const ranges: [number, number][] = [];
    for (const group of groups.value) {
      let low = Number.POSITIVE_INFINITY;
      let high = Number.NEGATIVE_INFINITY;
      for (const face of faces.value.filter((f) => group.includes(f.hash))) {
        const bounds = await kernel.bounds(face.id);
        if (!bounds.ok) continue;
        low = Math.min(low, bounds.value.min.z);
        high = Math.max(high, bounds.value.max.z);
      }
      ranges.push([low, high]);
    }
    return ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  };

  it('splits along a face, moved in along its normal', async () => {
    const ranges = await pieces(split({ along: [TOP], offset: -4 }));
    expect(ranges).toHaveLength(2);
    expect(ranges[0]?.[1]).toBeCloseTo(6);
    expect(ranges[1]?.[0]).toBeCloseTo(6);
  });

  it('splits along a tipped plane', async () => {
    const level = await pieces(split({ offset: 5 }));
    expect(level.map(([, top]) => Math.round(top))).toEqual([5, 10]);
    const tipped = await pieces(split({ offset: 5, tiltX: 5 }));
    expect(tipped).toHaveLength(2);
    // Tipped, neither piece is a flat slab any more: the lower one reaches above 5.
    expect(tipped[0]?.[1]).toBeGreaterThan(5.5);
  });
});
