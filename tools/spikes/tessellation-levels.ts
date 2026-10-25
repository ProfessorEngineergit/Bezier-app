/**
 * Spike: triangle count and time for candidate display tessellation settings.
 *
 * The draft setting (0.5 mm, 0.8 rad) gives eight segments per circle, which looks faceted. This
 * meshes a stored assembly at settings between draft and the default.
 *
 * Run: bench/node_modules/.bin/tsx tools/spikes/tessellation-levels.ts <store-dir> <key>
 */

import { directoryStore } from '../../bench/src/directory-store.ts';
import { createOcctKernel } from '../../packages/kernel/src/occt-kernel.ts';

const [directory, key] = process.argv.slice(2);
if (directory === undefined || key === undefined) throw new Error('usage: <store-dir> <key>');
const levels = [
  { linearDeflection: 0.5, angularDeflection: 0.8 },
  { linearDeflection: 0.25, angularDeflection: 0.5 },
  { linearDeflection: 0.2, angularDeflection: 0.4 },
  { linearDeflection: 0.1, angularDeflection: 0.35 },
  { linearDeflection: 0.05, angularDeflection: 0.3 },
];
for (const level of levels) {
  // Fresh kernel per level: OCCT keeps a finer triangulation once made.
  const kernel = await createOcctKernel({ store: directoryStore(directory) });
  const shape = await kernel.importKept(key);
  if (!shape.ok || shape.value === null) throw new Error('nothing kept under that key');
  const started = performance.now();
  const mesh = await kernel.tessellate(shape.value, level);
  if (!mesh.ok) throw new Error(mesh.error.message);
  console.log(
    `${level.linearDeflection} mm, ${level.angularDeflection} rad: ${(mesh.value.indices.length / 3 / 1e6).toFixed(2)} M triangles in ${((performance.now() - started) / 1000).toFixed(1)} s`,
  );
}
