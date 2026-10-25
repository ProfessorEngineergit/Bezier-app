/**
 * Spike: time and memory of each kernel step when importing the Voron assembly.
 *
 * In WebKit the importing page grew past 19 GB, and a 2-core 8 GB machine could not import it.
 *
 * Run: bench/node_modules/.bin/tsx tools/spikes/import-memory.ts <file.step>
 */
import { readFileSync } from 'node:fs';
import { createOcctKernel } from '../../packages/kernel/src/occt-kernel.ts';

const file = process.argv[2];
if (file === undefined) throw new Error('usage: import-memory <file.step>');
const mb = (n: number) => `${Math.round(n / 1048576)} MB`;
const step = (label: string, started: number) => {
  const m = process.memoryUsage();
  console.log(
    `${label.padEnd(16)} ${String(Math.round(performance.now() - started)).padStart(7)} ms  rss ${mb(m.rss)}  heap ${mb(m.heapUsed)}  ext+array ${mb(m.external + m.arrayBuffers)}`,
  );
};

let t = performance.now();
const text = readFileSync(file, 'utf8');
step('read text', t);
const kernel = await createOcctKernel();
t = performance.now();
const imported = await kernel.importStep(text);
if (!imported.ok) throw new Error(imported.error.message);
step('importStep', t);
t = performance.now();
const faces = await kernel.faceHashes(imported.value);
step(`faceHashes ${faces.ok ? faces.value.length : '?'}`, t);
t = performance.now();
const mesh = await kernel.tessellate(imported.value);
step(`tessellate ${mesh.ok ? mesh.value.indices.length / 3 : '?'} tri`, t);
t = performance.now();
const edges = await kernel.extractEdges(imported.value);
step(`edges ${edges.ok ? edges.value.positions.length / 3 : '?'} pts`, t);
t = performance.now();
const described = await kernel.describeFaces(imported.value);
step(`describeFaces`, t);
void described;
