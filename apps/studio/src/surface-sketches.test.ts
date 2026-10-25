/** A STEP of two loose rectangular faces comes in as two sketches, and they loft (audit F-017). */
import { readFileSync } from 'node:fs';
import { RebuildCache } from '@bezier/core';
import { createOcctKernel } from '@bezier/kernel/occt';
import { createSolver } from '@bezier/solver';
import { DocumentStore, MemoryBackend } from '@bezier/storage';
import { expect, it } from 'vitest';
import { Session } from './session.js';
import { outlinesAsSketches } from './surface-sketches.js';

const file = readFileSync(
  new URL('../test-files/loft-profiles-surfaces.step', import.meta.url),
  'utf8',
);

it('brings loose flat faces in as sketches on their planes, which loft into the solid', async () => {
  const kernel = await createOcctKernel();
  const imported = await kernel.importStep(file);
  if (!imported.ok) throw new Error(imported.error.message);
  const outlines = await kernel.flatOutlines(imported.value);
  if (!outlines.ok) throw new Error(outlines.error.message);
  expect(outlines.value).toHaveLength(2);
  const session = await Session.create('doc-s', 'Surfaces', {
    kernel,
    solver: await createSolver(),
    store: new DocumentStore(new MemoryBackend()),
    cache: new RebuildCache(),
  });
  const ops = outlinesAsSketches(outlines.value, 'Profiles', 0, 1);
  await session.apply(ops);
  const [from, to] = session.document.features.map((feature) => feature.id);
  const view = await session.apply({
    op: 'addFeature',
    id: 'loft-1',
    type: 'loft',
    name: 'Loft',
    index: 2,
    params: { from, to, ruled: true },
  });
  expect(view.statuses.get('loft-1')).toEqual({ state: 'ok' });
  if (view.body === null) throw new Error('no body');
  const mass = await kernel.massProperties(view.body);
  // 40 × 20 at z 0 to 20 × 10 at z 30: 30/3 · (800 + 200 + 400).
  expect(mass.ok && mass.value.volume).toBeCloseTo(14000, -1);
}, 60_000);
