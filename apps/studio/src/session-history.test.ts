/** Undo after reopening, against real storage (in memory) and the real kernel. */

import { RebuildCache } from '@bezier/core';
import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { DocumentStore, MemoryBackend } from '@bezier/storage';
import { rectangleSketch } from '@bezier/ui';
import { beforeAll, expect, it } from 'vitest';
import { placeholderSolver } from './placeholder-solver.js';
import { Session } from './session.js';

let kernel: GeometryKernel;
beforeAll(async () => {
  kernel = await createOcctKernel();
}, 30_000);

const deps = (backend: MemoryBackend) => ({
  kernel,
  solver: placeholderSolver(),
  store: new DocumentStore(backend),
  cache: new RebuildCache(),
});

async function edited(backend: MemoryBackend) {
  const session = await Session.create('doc-1', 'Test', deps(backend));
  await session.apply({
    op: 'addFeature',
    id: 'sketch-1',
    type: 'sketch',
    name: 'Sketch',
    index: 0,
    params: { plane: 'XY', sketch: rectangleSketch('r', { x: 0, y: 0, width: 40, height: 20 }) },
  });
  await session.apply({
    op: 'addFeature',
    id: 'extrude-1',
    type: 'extrude',
    name: 'Extrude',
    index: 1,
    params: { sketch: 'sketch-1', distance: 10, direction: 'forward', operation: 'new' },
  });
  await session.apply({ op: 'renameFeature', id: 'extrude-1', name: 'Base' });
  return session;
}

it('keeps undo and redo across closing and reopening', async () => {
  const backend = new MemoryBackend();
  const first = await edited(backend);
  await first.undo();
  expect(first.document.features[1]?.name).toBe('Extrude');

  const reopened = await Session.open('doc-1', deps(backend));
  expect(reopened.canUndo).toBe(true);
  expect(reopened.canRedo).toBe(true);
  await reopened.redo();
  expect(reopened.document.features[1]?.name).toBe('Base');
  await reopened.undo();
  await reopened.undo();
  expect(reopened.document.features.map((f) => f.id)).toEqual(['sketch-1']);
});

it('forgets the steps when the document no longer matches them', async () => {
  const backend = new MemoryBackend();
  await edited(backend);
  // Another edit that never reached the history file: the steps no longer fit.
  const store = new DocumentStore(backend);
  const loaded = await store.load('doc-1');
  await store.record('doc-1', loaded.document, { op: 'renameDocument', name: 'Elsewhere' });
  const reopened = await Session.open('doc-1', deps(backend));
  expect(reopened.canUndo).toBe(false);
});
