/**
 * Spike: check whether the Voron assembly's colours survive import (the app showed it all grey).
 * Run: bench/node_modules/.bin/tsx tools/spikes/voron-colours-check.ts <file.step>
 */
import { readFileSync } from 'node:fs';
import { solidsFromIges } from '../../packages/kernel/src/iges.ts';
import { coloursOf, NO_COLOUR, parseStepColors } from '../../packages/kernel/src/step-colors.ts';
import { loadOcct } from '../../packages/kernel/src/wasm.ts';

const text = readFileSync(process.argv[2] ?? '', 'latin1');
const parsed = parseStepColors(text);
console.log(
  'solid signatures with a colour:',
  parsed?.solids.size,
  'in order:',
  parsed?.inOrder.size,
);
const occt = await loadOcct();
const shape = solidsFromIges(occt, occt.importStep(text));
const colours = parsed === null ? null : coloursOf(occt, shape, parsed);
if (colours === null) {
  console.log('coloursOf: null, faces', occt.subShapeCount(shape, 'face'));
} else {
  const counts = new Map<number, number>();
  for (const c of colours) counts.set(c, (counts.get(c) ?? 0) + 1);
  console.log('faces', colours.length, 'uncoloured', counts.get(NO_COLOUR) ?? 0);
  console.log(
    [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([c, n]) => `${c.toString(16)}:${n}`)
      .join(' '),
  );
}
