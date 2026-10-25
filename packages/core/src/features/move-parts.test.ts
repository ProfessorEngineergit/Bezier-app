/**
 * Moving a face or edge of a box against the real kernel: shape changes, bending moves are
 * refused, and face names survive the move. The box is 40 × 60 × 10, standing on XY.
 */

import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import type { ConstraintSolver, Point2, SketchId } from '@bezier/solver';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CadDocument, createEmptyDocument } from '../document.js';
import { rebuild } from '../rebuild/rebuild.js';
import { edgeRef, formatRef, parseRef, vertexRef } from '../stable-ref.js';
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

describe('move-parts', () => {
  let kernel: GeometryKernel;
  let TOP = '';
  let FRONT = '';
  let LEFT = '';

  beforeAll(async () => {
    kernel = await createOcctKernel();
    const plain = await rebuild(
      { ...createEmptyDocument('Box', () => new Date(0)), features: box() },
      { kernel, solver },
    );
    for (const name of plain.naming.knownNames()) {
      const face = plain.naming.faceFor(name);
      const plane = face === null ? null : await kernel.facePlane(face);
      if (plane?.ok !== true) continue;
      const { normal } = plane.value;
      if (normal.z > 0.99) TOP = name;
      if (normal.y < -0.99) FRONT = name;
      if (normal.x < -0.99) LEFT = name;
    }
    if (TOP === '' || FRONT === '' || LEFT === '') throw new Error('box faces not found');
  }, 120_000);

  const withMove = (params: Record<string, unknown>): CadDocument => ({
    ...createEmptyDocument('Move', () => new Date(0)),
    features: [
      ...box(),
      {
        id: 'move-1',
        type: 'move-parts',
        name: 'Move',
        params: { dx: 0, dy: 0, dz: 0, ...params },
      },
    ],
  });

  const run = async (document: CadDocument) => {
    const result = await rebuild(document, { kernel, solver });
    const bounds =
      result.body === null
        ? null
        : await kernel.bounds(result.body).then((r) => (r.ok ? r.value : null));
    return { result, bounds };
  };

  it('pulls the top face up and keeps its name', async () => {
    const { result, bounds } = await run(withMove({ faces: [TOP], dz: 7 }));
    expect(result.statuses.get('move-1')).toEqual({ state: 'ok' });
    expect(bounds?.max.z).toBeCloseTo(17);
    // The name given before the move finds the face that came out of it.
    const face = result.naming.faceFor(TOP);
    expect(face).not.toBeNull();
    const plane = face === null ? null : await kernel.facePlane(face);
    expect(plane?.ok === true && plane.value.origin.z).toBeCloseTo(17);
  });

  it('lifts one top edge, tilting the top and the front, and leaves the rest', async () => {
    const edge = formatRef(edgeRef(parseRef(TOP) as never, parseRef(FRONT) as never));
    const { result, bounds } = await run(withMove({ edges: [edge], dz: 8 }));
    expect(result.statuses.get('move-1')).toEqual({ state: 'ok' });
    expect(bounds?.max.z).toBeCloseTo(18);
    expect(bounds?.min.z).toBeCloseTo(0);
    expect(bounds?.max.y).toBeCloseTo(60);
  });

  it('says why when the move only runs along the edge', async () => {
    const edge = formatRef(edgeRef(parseRef(TOP) as never, parseRef(FRONT) as never));
    const { result } = await run(withMove({ edges: [edge], dx: 6 }));
    const status = result.statuses.get('move-1');
    expect(status?.state).toBe('failed');
    expect(JSON.stringify(status)).toMatch(/changes nothing/);
  });

  it('turns the top face about a line across its middle, which tilts it in place', async () => {
    const { result, bounds } = await run(
      withMove({ faces: [TOP], axis: 'x', angle: 0.1, ox: 0, oy: 30, oz: 10 }),
    );
    expect(result.statuses.get('move-1')).toEqual({ state: 'ok' });
    // The top rises at the back and sinks at the front by 30·tan(0.1).
    expect(bounds?.max.z).toBeCloseTo(10 + 30 * Math.tan(0.1));
    expect(bounds?.min.z).toBeCloseTo(0);
  });

  it('turns a top edge, and the two faces at it turn with it', async () => {
    const edge = formatRef(edgeRef(parseRef(TOP) as never, parseRef(FRONT) as never));
    // About the bottom front edge: the front leans out, the top turns up behind it.
    const { result, bounds } = await run(
      withMove({ edges: [edge], axis: 'x', angle: 0.2, ox: 0, oy: 0, oz: 0 }),
    );
    expect(result.statuses.get('move-1')).toEqual({ state: 'ok' });
    expect(bounds?.min.y).toBeCloseTo(-10 * Math.sin(0.2), 4);
  });

  it('lifts one corner of the box, the faces at it tilting to reach it', async () => {
    const corner = formatRef(vertexRef([parseRef(TOP), parseRef(FRONT), parseRef(LEFT)] as never));
    const { result, bounds } = await run(withMove({ vertices: [corner], dz: 4 }));
    expect(result.statuses.get('move-1')).toEqual({ state: 'ok' });
    expect(bounds?.max.z).toBeCloseTo(14);
    expect(bounds?.min.z).toBeCloseTo(0);
  });

  it('asks for something to move', async () => {
    const { result } = await run(withMove({ dz: 3 }));
    expect(result.statuses.get('move-1')?.state).toBe('failed');
    expect(LEFT).not.toBe('');
  });
});
