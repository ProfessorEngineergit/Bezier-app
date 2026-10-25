/**
 * Measures how much coarser tessellation reduces triangle count and rebuild time on a large
 * assembly. Linear deflection alone is not enough: 0.25 mm is invisible on a frame rail but still
 * hundreds of triangles on an M3 screw, so angular deflection is varied too.
 *
 * Run: pnpm --filter @bezier/bench exec tsx src/draft-display.ts file.step [store-dir]
 */

import { readFileSync } from 'node:fs';
import { type CadDocument, createEmptyDocument, RebuildCache, rebuild } from '@bezier/core';
import type { TessellationOptions } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { fixedSolver } from './corpus.ts';
import { directoryStore } from './directory-store.ts';

/**
 * Coarsest first: OCCT keeps a face's triangulation and only remeshes for a finer setting, so a
 * coarse setting measured after a fine one reports the fine mesh.
 */
const SETTINGS: readonly (TessellationOptions & { label: string })[] = [
  { label: 'rough', linearDeflection: 1, angularDeflection: 1.2 },
  { label: 'draft', linearDeflection: 0.5, angularDeflection: 0.8 },
  { label: 'coarse angle', linearDeflection: 0.25, angularDeflection: 0.6 },
  { label: 'low (app)', linearDeflection: 0.25, angularDeflection: 0.3 },
  { label: 'medium (app default)', linearDeflection: 0.05, angularDeflection: 0.3 },
];

async function main(): Promise<void> {
  const [file, storeDirectory] = process.argv.slice(2);
  if (file === undefined) throw new Error('usage: draft-display <file.step> [store-dir]');
  const text = readFileSync(file, 'utf8');
  const store = storeDirectory === undefined ? undefined : directoryStore(storeDirectory);
  const kernel = await createOcctKernel(store === undefined ? {} : { store });
  const cache = new RebuildCache();
  const features: CadDocument['features'] = [
    {
      id: 'import-1',
      type: 'import-step',
      name: 'Import',
      params: { file: text, faceOrder: 'file' },
    },
  ];
  const document = { ...createEmptyDocument('Bench'), features };

  for (const setting of SETTINGS) {
    const started = performance.now();
    const result = await rebuild(document, {
      kernel,
      solver: fixedSolver(),
      cache,
      tessellation: setting,
    });
    const ms = performance.now() - started;
    const triangles = result.mesh === null ? 0 : result.mesh.indices.length / 3;
    const vertices = result.mesh === null ? 0 : result.mesh.positions.length / 3;
    const edgePoints = result.edges === null ? 0 : result.edges.positions.length / 3;
    const mb =
      result.mesh === null
        ? 0
        : (result.mesh.positions.byteLength * 2 +
            result.mesh.indices.byteLength +
            result.mesh.triangleFaces.byteLength) /
          1e6;
    console.log(
      `${setting.label.padEnd(22)} ${String(Math.round(ms)).padStart(7)} ms ` +
        `${String(triangles).padStart(9)} tris ${String(vertices).padStart(9)} verts ` +
        `${String(edgePoints).padStart(8)} edge pts ${mb.toFixed(0).padStart(5)} MB`,
    );
  }
}

await main();
