/**
 * Spike: counts how many of a file's solids get a colour from `step-colors.ts`.
 *
 * Run: npx tsx tools/spikes/step-colors-match.ts /path/to/file.step (from packages/kernel)
 */

import { readFileSync } from 'node:fs';
import { coloursOf, NO_COLOUR, parseStepColors } from '../../packages/kernel/src/step-colors.ts';
import { loadOcct } from '../../packages/kernel/src/wasm.ts';

const file = process.argv[2];
if (file === undefined) throw new Error('usage: step-colors-match <file.step>');
const text = readFileSync(file, 'utf8');
let started = performance.now();
const parsed = parseStepColors(text);
console.log(
  `parsed in ${(performance.now() - started).toFixed(0)} ms: ${parsed?.solids.size ?? 0} coloured signatures`,
);
if (parsed === null) process.exit(0);

const occt = await loadOcct();
started = performance.now();
const shape = occt.importStep(text);
console.log(`read in ${(performance.now() - started).toFixed(0)} ms`);
started = performance.now();
const colours = coloursOf(occt, shape, parsed);
console.log(`matched in ${(performance.now() - started).toFixed(0)} ms`);
if (colours === null) {
  console.log('no colours');
  process.exit(0);
}
const coloured = colours.filter((c) => c !== NO_COLOUR).length;
const distinct = new Set(colours);
console.log(`${coloured} of ${colours.length} faces coloured, ${distinct.size} distinct colours`);
const solids = occt.getSubShapes(shape, 'solid');
let solidMatched = 0;
let at = 0;
for (const solid of solids) {
  const n = occt.subShapeCount(solid, 'face');
  if (colours.subarray(at, at + n).some((c) => c !== NO_COLOUR)) solidMatched += 1;
  at += n;
}
console.log(`${solidMatched} of ${solids.length} solids coloured`);
