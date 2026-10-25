import type { GeometryKernel, KernelResult } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { beforeAll, expect, it } from 'vitest';
import { createEmptyDocument } from '../document.js';
import { RebuildCache } from '../rebuild/cache.js';
import { rebuild } from '../rebuild/rebuild.js';
import { stubSolver, testSketch } from '../rebuild/testing.js';

let kernel: GeometryKernel;
const cache = new RebuildCache();
const unwrap = <T>(result: KernelResult<T>) => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};
beforeAll(async () => {
  kernel = await createOcctKernel();
}, 120_000);

// A 40 × 60 × 15 block and a copy 50 mm along X (the faces are named as in align.test.ts).
const two = {
  ...createEmptyDocument('Joint'),
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

async function jointed(params: Record<string, unknown>) {
  const result = await rebuild(
    {
      ...two,
      features: [
        ...two.features,
        {
          id: 'joint-1',
          type: 'joint',
          name: 'Joint',
          params: { faces: ['F:copy-1:copy-1'], ...params },
        },
      ],
    },
    { kernel, solver: stubSolver(), cache },
  );
  expect(result.statuses.get('joint-1')).toEqual({ state: 'ok' });
  if (result.body === null) throw new Error('no body');
  return unwrap(await kernel.bounds(result.body));
}

it('slides the part along the axis face, held by its limits (audit F-054)', async () => {
  // The original's +X end: the copy slides along X.
  const axis = ['F:extrude-1:side-3'];
  expect((await jointed({ kind: 'slider', axis, distance: 10 })).max.x).toBeCloseTo(100, 4);
  // Past the most distance it stops there.
  expect(
    (await jointed({ kind: 'slider', axis, distance: 500, maxDistance: 20 })).max.x,
  ).toBeCloseTo(110, 4);
});

it('turns the part about the axis, held by its limits', async () => {
  // The original's top: a vertical axis through its middle (20, 30).
  const axis = ['F:extrude-1:side-1'];
  const turned = await jointed({ kind: 'revolute', axis, angle: Math.PI, maxAngle: Math.PI });
  // Half a turn about x = 20 takes the copy from 50…90 to −50…−10.
  expect(turned.min.x).toBeCloseTo(-50, 4);
  const held = await jointed({ kind: 'revolute', axis, angle: Math.PI, maxAngle: 0 });
  expect(held.min.x).toBeCloseTo(0, 4);
});
