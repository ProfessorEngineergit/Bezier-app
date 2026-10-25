/**
 * Spike: why does filleting an edge of an imported part fail?
 *
 * Every 0.2 mm fillet on the Voron assembly failed with "does not fit". This loads the stored BREP
 * and fillets edges of single solids directly.
 *
 * Result (Voron): a single solid works (solid 500: 12/12 edges, 19 ms each; edges between tangent
 * faces are correctly refused). The same edge on the whole assembly, or on a compound holding only
 * its part, fails immediately with `fillet: TopoDS::Solid` because occt-wasm casts the target to a
 * single solid.
 *
 * Run: bench/node_modules/.bin/tsx tools/spikes/fillet-imported.ts <kept.bin> [solid indices…]
 */

import { readFileSync } from 'node:fs';
import { loadOcct } from '../../packages/kernel/src/wasm.ts';

const [file, ...which] = process.argv.slice(2);
if (file === undefined) throw new Error('usage: fillet-imported <kept.bin> [solids…]');
const occt = await loadOcct();
const shape = occt.fromBREPBinary(readFileSync(file).subarray(32));
const solids = occt.getSubShapes(shape, 'solid');
console.log(`${solids.length} solids`);

for (const index of (which.length > 0 ? which : ['0', '10', '100', '500']).map(Number)) {
  const solid = solids[index];
  if (solid === undefined) continue;
  const edges = occt.getSubShapes(solid, 'edge');
  let ok = 0;
  let firstError = '';
  for (const edge of edges.slice(0, 12)) {
    try {
      const rounded = occt.fillet(solid, [edge], 0.2);
      occt.release(rounded);
      ok += 1;
    } catch (error) {
      firstError ||= String(error instanceof Error ? error.message : error).slice(0, 200);
    }
  }
  const valid = (occt as unknown as { isValid?: (s: unknown) => boolean }).isValid?.(solid);
  console.log(
    `solid ${index}: ${edges.length} edges, ${ok}/12 rounded; valid ${valid}; ${firstError}`,
  );
}

// The same edge on the whole assembly versus on its own part.
const part = solids[500];
if (part !== undefined) {
  const edge = occt.getSubShapes(part, 'edge')[0];
  const started = performance.now();
  try {
    const rounded = occt.fillet(shape, edge === undefined ? [] : [edge], 0.2);
    console.log(`whole assembly: rounded in ${Math.round(performance.now() - started)} ms`);
    occt.release(rounded);
  } catch (error) {
    console.log(
      `whole assembly: refused after ${Math.round(performance.now() - started)} ms: ${String(error instanceof Error ? error.message : error).slice(0, 200)}`,
    );
  }
  const alone = performance.now();
  occt.release(occt.fillet(part, edge === undefined ? [] : [edge], 0.2));
  console.log(`its part alone: ${Math.round(performance.now() - alone)} ms`);
}
