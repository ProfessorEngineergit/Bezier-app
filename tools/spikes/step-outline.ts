/**
 * Spike: speed and accuracy of an outline parsed directly from STEP text.
 *
 * Result (Voron, 242 MB, Node): 2.7 s, 287,982 polylines vs. 288,859 edges read by OCCT (the
 * difference is unsupported curve types), bounding box 430 × 531 × 522 mm as expected.
 *
 * Run: bench/node_modules/.bin/tsx tools/spikes/step-outline.ts <file.step>
 */

import { readFileSync } from 'node:fs';
import { parseStepOutline } from '../../packages/kernel/src/step-outline.ts';

const [file] = process.argv.slice(2);
if (file === undefined) throw new Error('usage: step-outline <file.step>');
let started = performance.now();
const text = readFileSync(file, 'utf8');
console.log(
  `read ${(text.length / 1e6).toFixed(0)} MB in ${Math.round(performance.now() - started)} ms`,
);
started = performance.now();
const outline = parseStepOutline(text);
const took = Math.round(performance.now() - started);
if (outline === null) throw new Error('no outline');
const { edges, box } = outline;
console.log(
  `outline in ${took} ms: ${edges.polylineStarts.length} polylines, ${edges.positions.length / 3} points, ${(edges.positions.byteLength / 1e6).toFixed(1)} MB`,
);
const show = (b: typeof box) =>
  `(${b.min.x.toFixed(1)}, ${b.min.y.toFixed(1)}, ${b.min.z.toFixed(1)}) – (${b.max.x.toFixed(1)}, ${b.max.y.toFixed(1)}, ${b.max.z.toFixed(1)})`;
console.log(`box ${show(box)}`);
