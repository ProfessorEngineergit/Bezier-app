/** An IGES file brought in: its surfaces sewn into a solid, which builds like a STEP import. */
import { readFileSync } from 'node:fs';
import { createEmptyDocument, rebuild } from '@bezier/core';
import { createOcctKernel } from '@bezier/kernel/occt';
import { expect, it } from 'vitest';
import { placeholderSolver } from './placeholder-solver.js';

const file = readFileSync(new URL('../test-files/cube-40x20x15.iges', import.meta.url), 'utf8');

it('imports an IGES block as one solid of the right size (audit F-037)', async () => {
  const kernel = await createOcctKernel();
  const document = {
    ...createEmptyDocument('IGES'),
    features: [
      {
        id: 'import-1',
        type: 'import-step',
        name: 'Import cube',
        params: { file, format: 'iges', faceOrder: 'file', placement: 'ground' },
      },
    ],
  };
  const result = await rebuild(document, { kernel, solver: placeholderSolver() });
  expect(result.statuses.get('import-1')).toEqual({ state: 'ok' });
  if (result.body === null) throw new Error('no body');
  const groups = await kernel.solidFaceGroups(result.body);
  expect(groups.ok && groups.value.length).toBe(1);
  const box = await kernel.bounds(result.body);
  if (!box.ok) throw new Error('no bounds');
  expect(box.value.max.x - box.value.min.x).toBeCloseTo(40);
  expect(box.value.max.z - box.value.min.z).toBeCloseTo(15);
}, 120_000);
