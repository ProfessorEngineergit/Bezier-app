/**
 * Spike: can a batched cut keep its history?
 *
 * `cutAll` returns no history, and reconstructing it would need geometric face matching, which
 * ADR 0001 rules out. Instead, fuse the tools into one solid and run a single `cutWithHistory`.
 * Checks speed, completeness of the history, and whether new faces can be attributed to a tool by
 * point containment.
 *
 * Result (occt-wasm 3.8.3, Apple Silicon, Node):
 *
 *   1. 2.5x faster (89.26 ms sequential vs. 36.33 ms fused); raw `cutAll` is 4.9x but has no
 *      history.
 *   2. `modified` is populated by OCCT, so existing names carry forward as with a single cut.
 *   3. Of 66 result faces, 61 map to exactly one tool, 0 are ambiguous, and 5 to none (the
 *      untouched box faces).
 *
 *   A face contained by several tools means overlapping tools; such a batch should fall back to
 *   sequential cuts.
 */

import { OcctKernel } from 'occt-wasm';

const H = 1_000_003;
const POCKETS = 12;

function time(label: string, work: () => void): number {
  for (let i = 0; i < 5; i++) work();
  const s: number[] = [];
  for (let i = 0; i < 30; i++) {
    const t = performance.now();
    work();
    s.push(performance.now() - t);
  }
  s.sort((a, b) => a - b);
  const p50 = s[Math.floor(s.length / 2)] ?? Number.NaN;
  console.log(`  ${label.padEnd(44)} ${p50.toFixed(2)} ms`);
  return p50;
}

const k = await OcctKernel.init();
const toolAt = (i: number) =>
  k.makeBoxFromCorners({ x: 5 + i * 8, y: 5, z: -5 }, { x: 10 + i * 8, y: 40, z: 15 });

console.log('\nFused tool versus sequential cuts\n');

const sequential = time('sequential cuts (with history)', () => {
  const m = k.checkpoint();
  let body = k.makeBox(120, 60, 20);
  for (let i = 0; i < POCKETS; i++) {
    const hashes = k.subShapeHashes(body, 'face', H);
    body = k.cutWithHistory(body, toolAt(i), hashes, H).result;
  }
  k.releaseSince(m);
});

const fused = time('fuseAll(tools) then one cutWithHistory', () => {
  const m = k.checkpoint();
  const body = k.makeBox(120, 60, 20);
  const tool = k.fuseAll(Array.from({ length: POCKETS }, (_, i) => toolAt(i)));
  const hashes = k.subShapeHashes(body, 'face', H);
  k.cutWithHistory(body, tool, hashes, H);
  k.releaseSince(m);
});

console.log(`\n      → ${(sequential / fused).toFixed(1)}x faster\n`);

// Inspect the history and attribution of the fused cut.
console.log('history from the fused cut:\n');
const m = k.checkpoint();
const body = k.makeBox(120, 60, 20);
const tools = Array.from({ length: POCKETS }, (_, i) => toolAt(i));
const before = k.subShapeHashes(body, 'face', H);
const ev = k.cutWithHistory(body, k.fuseAll(tools), before, H);

const after = k.subShapeHashes(ev.result, 'face', H);
console.log(`  input faces      ${before.length}`);
console.log(`  result faces     ${after.length}`);
console.log(`  modified entries ${ev.modified.length > 0 ? 'present' : 'EMPTY'}`);
console.log(`  deleted          ${ev.deleted.length}`);

// Attribute each face to a tool by containment.
const faces = k.getSubShapes(ev.result, 'face');
let attributed = 0;
let ambiguous = 0;
let unattributed = 0;

for (const face of faces) {
  const centre = k.getSurfaceCenterOfMass(face);
  const owners = tools.filter((t) => k.containsPoint(t, centre, 1e-6));
  if (owners.length === 1) attributed++;
  else if (owners.length > 1) ambiguous++;
  else unattributed++;
}

console.log(`\nattributing ${faces.length} result faces to a tool by containment:`);
console.log(`  exactly one tool   ${attributed}   (attributable)`);
console.log(`  several tools      ${ambiguous}   (ambiguous — would fall back)`);
console.log(`  no tool            ${unattributed}   (original body faces)`);

k.releaseSince(m);
k[Symbol.dispose]();
