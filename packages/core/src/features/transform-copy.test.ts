import type { GeometryKernel, KernelResult } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createEmptyDocument } from '../document.js';
import { RebuildCache } from '../rebuild/cache.js';
import { rebuild } from '../rebuild/rebuild.js';
import { stubSolver, testSketch } from '../rebuild/testing.js';
import { parseRef } from '../stable-ref.js';

let kernel: GeometryKernel;
const cache = new RebuildCache();
const document = {
  ...createEmptyDocument('Copy integration'),
  features: [
    testSketch,
    {
      id: 'extrude-1',
      type: 'extrude',
      name: 'Extrude',
      params: { sketch: 'sketch-1', distance: 15, direction: 'forward', operation: 'new' },
    },
  ],
};
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

it.each([5, 50, -50])(
  'copies by %s mm while preserving source faces, including overlapping solids',
  async (dx) => {
    const deps = { kernel, solver: stubSolver(), cache };
    const source = await rebuild(document, deps);
    const result = await rebuild(
      {
        ...document,
        features: [
          ...document.features,
          {
            id: 'copy-1',
            type: 'transform-copy',
            name: 'Copy',
            params: { dx },
          },
        ],
      },
      deps,
    );
    expect(result.statuses.get('copy-1')).toEqual({ state: 'ok' });
    if (!source.body || !result.body) throw new Error('Missing body');
    expect(unwrap(await kernel.describeFaces(result.body))).toHaveLength(12);
    const bounds = unwrap(await kernel.bounds(result.body));
    expect(bounds.min.x).toBeCloseTo(Math.min(0, dx), 4);
    expect(bounds.max.x).toBeCloseTo(40 + Math.max(0, dx), 4);
    for (const name of source.naming.knownNames()) {
      expect(result.naming.knownNames().has(name)).toBe(true);
      expect(await result.naming.resolve(kernel, parseRef(name))).not.toBeNull();
    }
    const names = [...result.naming.knownNames()].filter((name) => name.startsWith('F:copy-1:'));
    expect(names).toHaveLength(6);
    // Compound owns its geometry after the temporary transformed shape has been released.
    expect(unwrap(await kernel.tessellate(result.body)).indices.length).toBeGreaterThanOrEqual(72);
  },
);

it('rotates a copy about the specified pivot in radians', async () => {
  const result = await rebuild(
    {
      ...document,
      features: [
        ...document.features,
        {
          id: 'copy-turn',
          type: 'transform-copy',
          name: 'Copy',
          params: { axis: 'z', angle: Math.PI / 2 },
        },
      ],
    },
    { kernel, solver: stubSolver(), cache },
  );
  expect(result.statuses.get('copy-turn')).toEqual({ state: 'ok' });
  if (!result.body) throw new Error('Missing body');
  const bounds = unwrap(await kernel.bounds(result.body));
  expect(bounds.min.x).toBeCloseTo(-60, 4);
  expect(bounds.max.x).toBeCloseTo(40, 4);
  expect(bounds.max.y).toBeCloseTo(60, 4);
});

it('a zero copy preserves names instead of renaming the source', async () => {
  const deps = { kernel, solver: stubSolver(), cache };
  const source = await rebuild(document, deps);
  const result = await rebuild(
    {
      ...document,
      features: [
        ...document.features,
        {
          id: 'zero-copy',
          type: 'transform-copy',
          name: 'Copy',
          params: {},
        },
      ],
    },
    deps,
  );
  expect(result.statuses.get('zero-copy')).toEqual({ state: 'ok' });
  expect(result.naming.knownNames()).toEqual(source.naming.knownNames());
});

it('moves only the selected copy and copies it again without duplicating its neighbours', async () => {
  const deps = { kernel, solver: stubSolver(), cache };
  const copiedDocument = {
    ...document,
    features: [
      ...document.features,
      {
        id: 'first-copy',
        type: 'transform-copy',
        name: 'Copy',
        params: { dx: 50 },
      },
    ],
  };
  const copied = await rebuild(copiedDocument, deps);
  const faces = [...copied.naming.knownNames()].filter((name) => name.startsWith('F:first-copy:'));
  expect(faces).toHaveLength(6);
  const movedDocument = {
    ...document,
    features: [
      ...copiedDocument.features,
      {
        id: 'move-copy',
        type: 'move',
        name: 'Move copy',
        params: { dx: 20, faces },
      },
    ],
  };
  const moved = await rebuild(movedDocument, deps);
  expect(moved.statuses.get('move-copy')).toEqual({ state: 'ok' });
  if (!moved.body) throw new Error('Missing transformed body');
  const bounds = unwrap(await kernel.bounds(moved.body));
  expect(bounds.min.x).toBeCloseTo(0, 4);
  expect(bounds.max.x).toBeCloseTo(110, 4);
  const again = await rebuild(
    {
      ...document,
      features: [
        ...movedDocument.features,
        {
          id: 'second-copy',
          type: 'transform-copy',
          name: 'Copy again',
          params: { dx: 50, faces },
        },
      ],
    },
    deps,
  );
  expect(again.statuses.get('second-copy')).toEqual({ state: 'ok' });
  if (!again.body) throw new Error('Missing copied body');
  expect(unwrap(await kernel.describeFaces(again.body))).toHaveLength(18);
  expect(unwrap(await kernel.solidFaceGroups(again.body)).map((group) => group.length)).toEqual([
    6, 6, 6,
  ]);
  expect(
    [...again.naming.knownNames()].filter((name) => name.startsWith('F:extrude-1:')),
  ).toHaveLength(6);
  expect(
    [...again.naming.knownNames()].filter((name) => name.startsWith('F:first-copy:')),
  ).toHaveLength(6);
});
