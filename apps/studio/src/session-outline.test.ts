/**
 * Project, against the real kernel: the outline of a face of a 40 × 20 × 15 box comes back as four
 * straight edges in the face's own coordinates and reads as four joined lines once projected into a
 * sketch.
 */

import { faceRef, RebuildCache } from '@bezier/core';
import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { DocumentStore, MemoryBackend } from '@bezier/storage';
import { emptySketch, projectOutline, rectangleSketch } from '@bezier/ui';
import { beforeAll, expect, it } from 'vitest';
import { placeholderSolver } from './placeholder-solver.js';
import { Session } from './session.js';

let kernel: GeometryKernel;
beforeAll(async () => {
  kernel = await createOcctKernel();
}, 30_000);

it('projects the outline of a face as four joined lines', async () => {
  const backend = new MemoryBackend();
  const session = await Session.create('doc-1', 'Test', {
    kernel,
    solver: placeholderSolver(),
    store: new DocumentStore(backend),
    cache: new RebuildCache(),
  });
  await session.apply([
    {
      op: 'addFeature',
      id: 'sketch-1',
      type: 'sketch',
      name: 'Sketch',
      index: 0,
      params: { plane: 'XY', sketch: rectangleSketch('r', { x: 0, y: 0, width: 40, height: 20 }) },
    },
    {
      op: 'addFeature',
      id: 'extrude-1',
      type: 'extrude',
      name: 'Extrude',
      index: 1,
      params: { sketch: 'sketch-1', distance: 15, direction: 'forward', operation: 'new' },
    },
  ]);
  const outline = await session.faceOutline(faceRef('extrude-1', 'end'));
  expect(outline).not.toBeNull();
  expect(outline).toHaveLength(4);
  const sketch = projectOutline(emptySketch(), outline ?? []);
  expect(sketch.primitives.filter((p) => p.kind === 'line')).toHaveLength(4);
  expect(sketch.primitives.filter((p) => p.kind === 'point')).toHaveLength(4);
  const lengths = sketch.primitives
    .filter((p) => p.kind === 'line')
    .map((line) => {
      const at = (id: string) => sketch.primitives.find((p) => p.id === id);
      const a = at(line.kind === 'line' ? line.start : '');
      const b = at(line.kind === 'line' ? line.end : '');
      return a?.kind === 'point' && b?.kind === 'point'
        ? Math.round(Math.hypot(a.x - b.x, a.y - b.y))
        : 0;
    })
    .sort((x, y) => x - y);
  // Whichever face `end` names, it is a rectangle of the box's sides.
  expect(new Set(lengths).size).toBeLessThanOrEqual(2);
  for (const length of lengths) expect([15, 20, 40]).toContain(length);
});
