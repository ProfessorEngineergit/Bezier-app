/**
 * Mirror and pattern against the real kernel: where the copies land and how many there are.
 * The box is 40 × 60 × 10, standing on XY at the origin.
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

/** The +X side's name, found by asking (an extrude's tags follow the kernel's face order). */
let SIDE = '';

function withFeature(type: string, params: Record<string, unknown>): CadDocument {
  return {
    ...createEmptyDocument('Copies', () => new Date(0)),
    features: [...box(), { id: 'f-1', type, name: type, params: { faces: [SIDE], ...params } }],
  };
}

describe('mirror and pattern', () => {
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
    }
    if (SIDE === '') throw new Error('no side face');
  }, 120_000);

  /** Each solid's X range, left to right. */
  const solids = async (document: CadDocument) => {
    const result = await rebuild(document, { kernel, solver });
    expect(result.statuses.get('f-1')).toEqual({ state: 'ok' });
    if (result.body === null) throw new Error('no body');
    const groups = await kernel.solidFaceGroups(result.body);
    const faces = await kernel.describeFaces(result.body);
    if (!groups.ok || !faces.ok) throw new Error('could not read the solids');
    const ranges: [number, number][] = [];
    for (const group of groups.value) {
      let low = Number.POSITIVE_INFINITY;
      let high = Number.NEGATIVE_INFINITY;
      for (const face of faces.value.filter((f) => group.includes(f.hash))) {
        const bounds = await kernel.bounds(face.id);
        if (!bounds.ok) continue;
        low = Math.min(low, bounds.value.min.x);
        high = Math.max(high, bounds.value.max.x);
      }
      ranges.push([Math.round(low), Math.round(high)]);
    }
    return ranges.sort((a, b) => a[0] - b[0]);
  };

  it('mirrors in an origin plane, keeping the original', async () => {
    expect(await solids(withFeature('mirror', { plane: 'YZ' }))).toEqual([
      [-40, 0],
      [0, 40],
    ]);
  });

  it('moves instead when the original is not kept', async () => {
    expect(await solids(withFeature('mirror', { plane: 'YZ', keep: false }))).toEqual([[-40, 0]]);
  });

  it('mirrors in a face of the part', async () => {
    expect(await solids(withFeature('mirror', { along: [SIDE] }))).toEqual([
      [0, 40],
      [40, 80],
    ]);
  });

  it('repeats in a row', async () => {
    expect(await solids(withFeature('pattern', { count: 3, dx: 50 }))).toEqual([
      [0, 40],
      [50, 90],
      [100, 140],
    ]);
  });

  it('repeats round an axis, a full turn spaced evenly', async () => {
    const ranges = await solids(
      withFeature('pattern', { arrangement: 'circular', count: 4, axis: 'z', angle: 360 }),
    );
    expect(ranges).toHaveLength(4);
    // Quarter turns of a box at the origin: two reach left of the axis.
    expect(ranges.filter(([low]) => low < -1)).toHaveLength(2);
  });
});
