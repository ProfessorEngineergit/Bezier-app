/**
 * A long history rebuilds. Cache keys must not grow with history length; nested keys once hit
 * "Invalid string length" in V8 and "Out of memory" in WebKit after a few dozen features.
 */

import { createOcctKernel } from '@bezier/kernel/occt';
import type { ConstraintSolver } from '@bezier/solver';
import { expect, it } from 'vitest';
import { createEmptyDocument } from '../document.js';
import type { FeatureRecord } from '../features/types.js';
import { rebuild } from './rebuild.js';

const solver: ConstraintSolver = {
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
  dispose() {},
};

it('rebuilds a history of a hundred features', async () => {
  const kernel = await createOcctKernel();
  const features: FeatureRecord[] = Array.from({ length: 100 }, (_, i) => ({
    id: `sketch-${i}`,
    type: 'sketch',
    name: `Sketch ${i}`,
    params: {
      plane: 'XY',
      sketch: {
        primitives: [
          { kind: 'point', id: 'a', x: i, y: 0 },
          { kind: 'point', id: 'b', x: i + 5, y: 5 },
          { kind: 'line', id: 'l', start: 'a', end: 'b' },
        ],
        constraints: [],
      },
    },
  }));
  const result = await rebuild(
    { ...createEmptyDocument('Long', () => new Date(0)), features },
    { kernel, solver },
  );
  expect([...result.statuses.values()].every((status) => status.state === 'ok')).toBe(true);
}, 120_000);
