import { parseRef } from '@bezier/core';
import { expect, it } from 'vitest';
import { refLabel } from './ref-label.js';

const names: Record<string, string> = {
  'import-1792261388964': 'Block.step',
  'extrude-1': 'Extrude',
};
const nameOf = (id: string) => names[id];

it('says a reference in words, with the feature by its name (audit F-012)', () => {
  const face = parseRef('F:import-1792261388964:face-6');
  if (face === null) throw new Error('no ref');
  expect(refLabel(face, nameOf)).toBe('Block.step · face 6');
  const end = parseRef('F:extrude-1:end');
  if (end === null) throw new Error('no ref');
  expect(refLabel(end, nameOf)).toBe('Extrude · end face');
});
