/**
 * The rebuild cache against the real kernel: a cached rebuild must equal an uncached one, and the
 * cache must skip work and release what it evicts.
 */

import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CadDocument } from '../document.js';
import { createEmptyDocument } from '../document.js';
import type { FeatureRecord } from '../features/types.js';
import { RebuildCache } from './cache.js';
import { rebuild } from './rebuild.js';
import { stubSolver, testSketch } from './testing.js';

const LOAD_TIMEOUT_MS = 120_000;

function extrude(id: string, distance: number, operation = 'new'): FeatureRecord {
  return {
    id,
    type: 'extrude',
    name: id,
    params: { sketch: 'sketch-1', distance, direction: 'forward', operation },
  };
}

function documentWith(...features: FeatureRecord[]): CadDocument {
  const base = createEmptyDocument('Cached', () => new Date('2026-08-05T12:00:00.000Z'));
  return { ...base, features };
}

describe('the rebuild cache', () => {
  let kernel: GeometryKernel;

  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, LOAD_TIMEOUT_MS);

  it('produces the same geometry as an uncached rebuild', async () => {
    const document = documentWith(testSketch, extrude('extrude-1', 15));

    const uncached = await rebuild(document, { kernel, solver: stubSolver() });
    const cache = new RebuildCache();
    const cached = await rebuild(document, { kernel, solver: stubSolver(), cache });

    expect(cached.mesh?.indices.length).toBe(uncached.mesh?.indices.length);
    expect([...cached.naming.knownNames()].sort()).toEqual(
      [...uncached.naming.knownNames()].sort(),
    );

    await cache.clear(kernel);
  });

  it('hits on an unchanged rebuild', async () => {
    const document = documentWith(testSketch, extrude('extrude-1', 15));
    const cache = new RebuildCache();

    await rebuild(document, { kernel, solver: stubSolver(), cache });
    const before = cache.stats().hits;

    await rebuild(document, { kernel, solver: stubSolver(), cache });
    expect(cache.stats().hits).toBeGreaterThan(before);

    await cache.clear(kernel);
  });

  it('misses only from the changed feature onward', async () => {
    // What makes editing a long history cheap: an edit invalidates what depends on it and nothing
    // else.
    const cache = new RebuildCache();
    const first = documentWith(
      testSketch,
      extrude('a', 20),
      extrude('b', 5, 'cut'),
      extrude('c', 3, 'cut'),
    );

    await rebuild(first, { kernel, solver: stubSolver(), cache });
    const afterWarm = cache.stats();

    // Change the *last* feature. The two before it must still be hits.
    const edited = documentWith(
      testSketch,
      extrude('a', 20),
      extrude('b', 5, 'cut'),
      extrude('c', 4, 'cut'),
    );
    await rebuild(edited, { kernel, solver: stubSolver(), cache });

    const delta = cache.stats().hits - afterWarm.hits;
    expect(delta).toBeGreaterThanOrEqual(2);

    await cache.clear(kernel);
  });

  it('invalidates everything downstream of an edit', async () => {
    // The other half: changing something early must not serve stale geometry for what came after.
    const cache = new RebuildCache();

    const thin = documentWith(testSketch, extrude('a', 10), extrude('b', 5, 'cut'));
    const thick = documentWith(testSketch, extrude('a', 30), extrude('b', 5, 'cut'));

    const first = await rebuild(thin, { kernel, solver: stubSolver(), cache });
    const second = await rebuild(thick, { kernel, solver: stubSolver(), cache });

    // Different heights must mean different geometry. If the cache served the first body for the
    // second document, these would match.
    expect(second.mesh?.positions.length).toBeDefined();
    expect(first.body).not.toBe(second.body);

    await cache.clear(kernel);
  });

  it('rebuilds what follows a sketch whose drawing changed', async () => {
    // A sketch is edited by changing its drawing, not a number, so the cache key must cover the
    // drawing itself and not read it as "[object Object]".
    const cache = new RebuildCache();
    const drawn = (width: number): FeatureRecord => ({
      ...testSketch,
      params: {
        plane: 'XY',
        sketch: {
          primitives: [
            { kind: 'point', id: 'p0', x: 0, y: 0 },
            { kind: 'point', id: 'p1', x: width, y: 0 },
            { kind: 'point', id: 'p2', x: width, y: 20 },
            { kind: 'point', id: 'p3', x: 0, y: 20 },
            { kind: 'line', id: 'l0', start: 'p0', end: 'p1' },
            { kind: 'line', id: 'l1', start: 'p1', end: 'p2' },
            { kind: 'line', id: 'l2', start: 'p2', end: 'p3' },
            { kind: 'line', id: 'l3', start: 'p3', end: 'p0' },
          ],
          constraints: [],
        },
      },
    });
    const asDrawn = {
      solve: (sketch: import('@bezier/solver').Sketch) => ({
        status: 'solved' as const,
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

    await rebuild(documentWith(drawn(40), extrude('a', 10)), { kernel, solver: asDrawn, cache });
    const wider = await rebuild(documentWith(drawn(80), extrude('a', 10)), {
      kernel,
      solver: asDrawn,
      cache,
    });
    if (wider.body === null) throw new Error('nothing built');
    const bounds = await kernel.bounds(wider.body);
    expect(bounds.ok && bounds.value.max.x).toBeCloseTo(80, 6);

    await cache.clear(kernel);
  });

  it(
    'releases shapes it evicts',
    async () => {
      // Every entry pins kernel memory the garbage collector cannot reach.
      const cache = new RebuildCache(2);
      const before = await kernel.liveShapeCount();

      for (const distance of [10, 20, 30, 40, 50]) {
        await rebuild(documentWith(testSketch, extrude('a', distance)), {
          kernel,
          solver: stubSolver(),
          cache,
        });
      }

      expect(cache.stats().size).toBeLessThanOrEqual(2);
      await cache.clear(kernel);

      // Not exact: the final body of the last rebuild is kept alive for the caller to display. The
      // point is that it is bounded and not growing.
      expect(await kernel.liveShapeCount()).toBeLessThan(before + 40);
    },
    LOAD_TIMEOUT_MS,
  );
});
