import type { FaceHash, GeometryKernel, KernelResult } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createEmptyDocument } from '../document.js';
import { RebuildCache } from '../rebuild/cache.js';
import { rebuild } from '../rebuild/rebuild.js';
import { stubSolver, testSketch } from '../rebuild/testing.js';
import { parseRef } from '../stable-ref.js';
import { thenAfter, turnBetween } from './align.js';

let kernel: GeometryKernel;
const cache = new RebuildCache();
const unwrap = <T>(result: KernelResult<T>) => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};
beforeAll(async () => {
  kernel = await createOcctKernel();
}, 120_000);
afterAll(async () => {
  await cache.clear(kernel);
});

// Audit F-066: a 40 × 60 × 15 block and a copy 50 mm along X, as in the audit's run.
const copied = {
  ...createEmptyDocument('Align'),
  features: [
    testSketch,
    {
      id: 'extrude-1',
      type: 'extrude',
      name: 'Extrude',
      params: { sketch: 'sketch-1', distance: 15, direction: 'forward', operation: 'new' },
    },
    { id: 'copy-1', type: 'transform-copy', name: 'Copy', params: { dx: 50 } },
  ],
};

/** The name of the face of `feature` whose outward normal is `normal`. */
async function faceFacing(feature: string, normal: { x: number; y: number; z: number }) {
  const result = await rebuild(copied, { kernel, solver: stubSolver(), cache });
  for (const name of result.naming.knownNames()) {
    if (!name.startsWith(`F:${feature}:`)) continue;
    const face = await result.naming.resolve(kernel, parseRef(name));
    if (face === null) continue;
    const plane = await kernel.facePlane(face);
    if (!plane.ok) continue;
    const n = plane.value.normal;
    if (Math.abs(n.x - normal.x) + Math.abs(n.y - normal.y) + Math.abs(n.z - normal.z) < 1e-6)
      return name;
  }
  throw new Error(`no face of ${feature} facing ${JSON.stringify(normal)}`);
}

async function aligned(params: Record<string, unknown>) {
  const from = await faceFacing('copy-1', { x: 0, y: -1, z: 0 });
  const to = await faceFacing('extrude-1', { x: 1, y: 0, z: 0 });
  const result = await rebuild(
    {
      ...copied,
      features: [
        ...copied.features,
        {
          id: 'align-1',
          type: 'align',
          name: 'Align',
          params: { from: [from], to: [to], ...params },
        },
      ],
    },
    { kernel, solver: stubSolver(), cache },
  );
  expect(result.statuses.get('align-1')).toEqual({ state: 'ok' });
  if (!result.body) throw new Error('Missing body');
  return { result, bounds: unwrap(await kernel.bounds(result.body)) };
}

it('turns the copy a quarter and sets its side against the end of the original', async () => {
  const { result, bounds } = await aligned({});
  // The 40 × 60 block's copy, turned: its 60 mm now runs along X from the original's end at 40.
  expect(bounds.min.x).toBeCloseTo(0, 4);
  expect(bounds.max.x).toBeCloseTo(100, 4);
  expect(bounds.max.z).toBeCloseTo(15, 4);
  // The moved face sits on the target's middle, looking back at it.
  const moved = await result.naming.resolve(
    kernel,
    parseRef(await faceFacing('copy-1', { x: 0, y: -1, z: 0 })),
  );
  if (moved === null) throw new Error('the moved face lost its name');
  const plane = unwrap(await kernel.facePlane(moved));
  expect(plane.origin.x).toBeCloseTo(40, 4);
  expect(plane.origin.y).toBeCloseTo(30, 4);
  expect(plane.origin.z).toBeCloseTo(7.5, 4);
  expect(plane.normal.x).toBeCloseTo(-1, 6);
  // Both bodies keep their faces' names, so a later step on either still finds them.
  const names = [...result.naming.knownNames()];
  expect(names.filter((name) => name.startsWith('F:copy-1:'))).toHaveLength(6);
  expect(names.filter((name) => name.startsWith('F:extrude-1:'))).toHaveLength(6);
});

it('leaves a gap along the face it is set against', async () => {
  const { bounds } = await aligned({ gap: 5 });
  expect(bounds.max.x).toBeCloseTo(105, 4);
});

it('turns half way round for opposite faces and not at all for faces already facing', () => {
  expect(turnBetween({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 })).toBeNull();
  expect(turnBetween({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 })?.angle).toBeCloseTo(Math.PI);
  expect(turnBetween({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })?.angle).toBeCloseTo(Math.PI / 2);
});

it('chains two histories', () => {
  const h = (n: number) => n as FaceHash;
  const [h1, h2, h3, h4, h5, h6, h7] = [h(1), h(2), h(3), h(4), h(5), h(6), h(7)];
  const first = {
    unchanged: [h1],
    modified: [{ from: h2, to: [h3] }],
    deleted: [h4],
    generated: [h5],
  };
  const second = {
    unchanged: [],
    modified: [
      { from: h1, to: [h6] },
      { from: h3, to: [h7] },
    ],
    deleted: [h5],
    generated: [],
  };
  expect(thenAfter(first, second)).toEqual({
    unchanged: [],
    modified: [
      { from: h1, to: [h6] },
      { from: h2, to: [h7] },
    ],
    deleted: [h4],
    generated: [],
  });
});
