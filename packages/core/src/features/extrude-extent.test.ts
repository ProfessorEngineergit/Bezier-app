/**
 * An extrusion "through all" reaches the far side of whatever is there at that point in the
 * history, and a pulled face can stand as a body of its own. Against the real kernel.
 */

import type { GeometryKernel, KernelResult } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import type { ConstraintSolver, Sketch, SketchId } from '@bezier/solver';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CadDocument, createEmptyDocument } from '../document.js';
import { rebuild } from '../rebuild/rebuild.js';
import type { FeatureRecord } from './types.js';

const LOAD_TIMEOUT_MS = 120_000;

/** Solves nothing: every point is already where the sketch says it is. */
function placedSolver(): ConstraintSolver {
  return {
    solve: (sketch) => ({
      status: 'solved',
      positions: new Map(
        sketch.primitives.flatMap((p) =>
          p.kind === 'point' ? [[p.id, { x: p.x, y: p.y }] as const] : [],
        ),
      ),
      radii: new Map(),
      dof: 0,
      conflicting: [],
      redundant: [],
    }),
    dispose: () => {},
  };
}

function rectangle(x0: number, y0: number, x1: number, y1: number): Sketch {
  const corners: [SketchId, number, number][] = [
    ['p0', x0, y0],
    ['p1', x1, y0],
    ['p2', x1, y1],
    ['p3', x0, y1],
  ];
  return {
    primitives: [
      ...corners.map(([id, x, y]) => ({ kind: 'point' as const, id, x, y })),
      ...corners.map(([id], i) => ({
        kind: 'line' as const,
        id: `l${i}`,
        start: id,
        end: corners[(i + 1) % corners.length]?.[0] ?? 'p0',
      })),
    ],
    constraints: [],
  };
}

const sketch = (id: string, x0: number, y0: number, x1: number, y1: number): FeatureRecord => ({
  id,
  type: 'sketch',
  name: id,
  params: { plane: 'XY', sketch: rectangle(x0, y0, x1, y1) },
});

const extrude = (id: string, sketchId: string, params: Record<string, unknown>): FeatureRecord => ({
  id,
  type: 'extrude',
  name: id,
  params: { sketch: sketchId, distance: 10, direction: 'forward', operation: 'new', ...params },
});

const documentOf = (...features: FeatureRecord[]): CadDocument => ({
  ...createEmptyDocument('Extent'),
  features,
});

function unwrap<T>(result: KernelResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('extrude extent and result', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, LOAD_TIMEOUT_MS);

  const built = async (...features: FeatureRecord[]) => {
    const result = await rebuild(documentOf(...features), { kernel, solver: placedSolver() });
    for (const [id, status] of result.statuses) {
      if (status.state !== 'ok') throw new Error(`${id}: ${JSON.stringify(status)}`);
    }
    if (result.body === null) throw new Error('no body');
    return { result, body: result.body };
  };

  it('cuts right through a block made taller, from a sketch under it', async () => {
    const { body } = await built(
      sketch('sketch-1', 0, 0, 20, 20),
      extrude('extrude-1', 'sketch-1', { distance: 35 }),
      sketch('sketch-2', 8, 8, 12, 12),
      extrude('cut-1', 'sketch-2', { operation: 'cut', extent: 'through', distance: 1 }),
    );
    // A square hole all the way up: the block's six faces and the hole's four walls.
    expect(unwrap(await kernel.describeFaces(body))).toHaveLength(10);
  });

  it('pulls a face out into a body of its own, leaving the first as it was', async () => {
    const block = [sketch('sketch-1', 0, 0, 20, 20), extrude('extrude-1', 'sketch-1', {})];
    const pull = (result: string): FeatureRecord => ({
      id: 'pull-1',
      type: 'face-extrude',
      name: 'pull',
      params: { faces: ['F:extrude-1:end'], distance: 5, merge: true, result },
    });
    const joined = await built(...block, pull('join'));
    const apart = await built(...block, pull('new'));
    // The same 5 mm out from the face either way; `end` names the cap of a forward extrusion.
    const reach = (b: { min: { y: number }; max: { z: number } }) => [b.min.y, b.max.z];
    expect(reach(unwrap(await kernel.bounds(joined.body)))).toEqual(
      reach(unwrap(await kernel.bounds(apart.body))),
    );
    // Joined, one block of six faces; apart, the block and the new slab as two solids.
    expect(unwrap(await kernel.describeFaces(joined.body))).toHaveLength(6);
    expect(unwrap(await kernel.solidFaceGroups(joined.body))).toHaveLength(1);
    expect(unwrap(await kernel.solidFaceGroups(apart.body))).toHaveLength(2);
  });

  it('pushes a face right through, measured from the face', async () => {
    const { body } = await built(
      sketch('sketch-1', 0, 0, 20, 20),
      extrude('extrude-1', 'sketch-1', {}),
      sketch('sketch-2', 30, 0, 40, 20),
      extrude('extrude-2', 'sketch-2', { distance: 30 }),
      {
        id: 'push-1',
        type: 'face-extrude',
        name: 'push',
        params: { faces: ['F:extrude-1:end'], distance: -1, extent: 'through' },
      },
    );
    // The first block is cut away entirely; only the second, taller one is left.
    const bounds = unwrap(await kernel.bounds(body));
    expect(bounds.min.x).toBeCloseTo(30);
  });

  it('leans the walls in by the taper, and keeps naming the top (audit F-016)', async () => {
    const { result, body } = await built(
      sketch('sketch-1', 0, 0, 40, 20),
      extrude('extrude-1', 'sketch-1', { taper: 10 }),
    );
    const faces = unwrap(await kernel.describeFaces(body));
    const measured = unwrap(await kernel.measureFaces(faces.map((f) => f.id)));
    const top = measured.find((m) => Math.abs(m.centre.z - 10) < 1e-6);
    // Each side moves in by tan 10° over the 10 mm: the top is smaller than the 40 × 20 bottom.
    const inset = 10 * Math.tan((10 * Math.PI) / 180);
    expect(top?.area).toBeCloseTo((40 - 2 * inset) * (20 - 2 * inset), 1);
    expect([...result.naming.knownNames()]).toContain('F:extrude-1:end');
  });
});
