/**
 * Extruding again from the same sketch, with and without `merge`. Against the real kernel.
 * The box is 40 × 60 × 10, standing on XY, with a slab added under it.
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

describe('extrude merge', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, 120_000);

  const faceCount = async (merge: boolean, targeted = false) => {
    let targets: string[] = [];
    if (targeted) {
      const plain = await rebuild(
        { ...createEmptyDocument('Box', () => new Date(0)), features: box() },
        { kernel, solver },
      );
      targets = [[...plain.naming.knownNames()][0] as string];
    }
    const document: CadDocument = {
      ...createEmptyDocument('Merge', () => new Date(0)),
      features: [
        ...box(),
        {
          id: 'extrude-2',
          type: 'extrude',
          name: 'Extrude',
          params: {
            sketch: 'sketch-1',
            distance: 5,
            direction: 'backward',
            operation: 'add',
            targets,
            merge,
          },
        },
      ],
    };
    const result = await rebuild(document, { kernel, solver });
    expect(result.statuses.get('extrude-2')).toEqual({ state: 'ok' });
    if (result.body === null) throw new Error('no body');
    const faces = await kernel.describeFaces(result.body);
    if (!faces.ok) throw new Error(faces.error.message);
    return faces.value.length;
  };

  it('leaves a seam in the walls unless it is asked not to', async () => {
    expect(await faceCount(false)).toBe(10);
  });

  it('continues the walls as one when merged', async () => {
    expect(await faceCount(true)).toBe(6);
  });

  it('merges a sketch drawn on the top face and extruded upward', async () => {
    const plain = await rebuild(
      { ...createEmptyDocument('Box', () => new Date(0)), features: box() },
      { kernel, solver },
    );
    let top = '';
    for (const name of plain.naming.knownNames()) {
      const face = plain.naming.faceFor(name);
      const plane = face === null ? null : await kernel.facePlane(face);
      if (plane?.ok === true && plane.value.normal.z > 0.99) top = name;
    }
    const first = box();
    const sketch = first[0] as FeatureRecord;
    const document: CadDocument = {
      ...createEmptyDocument('Merge', () => new Date(0)),
      features: [
        ...first,
        {
          id: 'sketch-2',
          type: 'sketch',
          name: 'Sketch 2',
          params: { plane: 'XY', face: [top], sketch: sketch.params.sketch, offset: 0 },
        },
        {
          id: 'extrude-2',
          type: 'extrude',
          name: 'Extrude',
          params: {
            sketch: 'sketch-2',
            distance: 12,
            direction: 'forward',
            operation: 'add',
            targets: [top],
            merge: true,
          },
        },
      ],
    };
    const result = await rebuild(document, { kernel, solver });
    expect(result.statuses.get('extrude-2')).toEqual({ state: 'ok' });
    if (result.body === null) throw new Error('no body');
    const faces = await kernel.describeFaces(result.body);
    if (!faces.ok) throw new Error(faces.error.message);
    expect(faces.value.length).toBe(6);
    const edges = await kernel.extractEdges(result.body);
    if (!edges.ok) throw new Error(edges.error.message);
    // Twelve edges of a box, and none where the two extrusions met.
    expect(edges.value.polylineStarts.length).toBe(12);
  });

  it('does so too when the part to add to is named', async () => {
    expect(await faceCount(true, true)).toBe(6);
  });
});
