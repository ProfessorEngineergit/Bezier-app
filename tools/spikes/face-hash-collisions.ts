/**
 * Spike: count face-hash collisions on a large assembly. Hashes have 1,000,003 buckets and the
 * Voron has 107,855 faces, so the birthday bound predicts thousands of collisions. Colliding faces
 * share a name in the naming layer and are treated as one split face.
 *
 * Run: bench/node_modules/.bin/tsx tools/spikes/face-hash-collisions.ts <file.step>
 */
import { readFileSync } from 'node:fs';
import { createOcctKernel } from '../../packages/kernel/src/occt-kernel.ts';

const text = readFileSync(process.argv[2] ?? '', 'latin1');
const kernel = await createOcctKernel();
const shape = await kernel.importStep(text);
if (!shape.ok) throw new Error(shape.error.message);
const hashes = await kernel.faceHashes(shape.value);
if (!hashes.ok) throw new Error(hashes.error.message);
const counts = new Map<number, number>();
for (const hash of hashes.value) counts.set(hash, (counts.get(hash) ?? 0) + 1);
const shared = [...counts.values()].filter((n) => n > 1);
console.log(
  `faces ${hashes.value.length}, distinct hashes ${counts.size}, hashes shared by more than one face ${shared.length} (${shared.reduce((a, b) => a + b, 0)} faces)`,
);
