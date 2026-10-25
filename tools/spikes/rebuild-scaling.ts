/**
 * Spike: why does rebuild time grow super-linearly (4.8 ms at 4 features, 726 ms at 82)?
 *
 * Splits the cost into OCCT booleans and our per-feature `describeFaces`, which is O(faces) per
 * feature and therefore O(N²) over a history on its own.
 *
 * Run: node --experimental-strip-types tools/spikes/rebuild-scaling.ts
 */

import { OcctKernel } from 'occt-wasm';

const HASH_UPPER_BOUND = 1_000_003;

interface Phase {
  boolean: number;
  describeFaces: number;
  faces: number;
}

function grid(index: number, columns: number, spacing: number) {
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: spacing * 0.5 + column * spacing,
    y: spacing * 0.5 + row * spacing,
  };
}

/**
 * Builds a block with `count` pockets, timing the cut and the face description separately, as
 * `rebuild()` does them.
 */
function buildTimed(k: OcctKernel, count: number): Phase[] {
  const columns = Math.ceil(Math.sqrt(count));
  const spacing = 14;
  const size = (columns + 1) * spacing;

  const mark = k.checkpoint();
  let body = k.makeBox(size, size, 20);
  const phases: Phase[] = [];

  for (let i = 0; i < count; i++) {
    const at = grid(i, columns, spacing);
    const tool = k.makeBoxFromCorners(
      { x: at.x, y: at.y, z: -5 },
      { x: at.x + 8, y: at.y + 8, z: 5 + (i % 7) },
    );

    const beforeBoolean = performance.now();
    const hashes = k.subShapeHashes(body, 'face', HASH_UPPER_BOUND);
    const evolution = k.cutWithHistory(body, tool, hashes, HASH_UPPER_BOUND);
    body = evolution.result;
    const afterBoolean = performance.now();

    // As in rebuild(): describe every face so names carry forward.
    const faces = k.getSubShapes(body, 'face');
    for (const face of faces) {
      k.hashCode(face, HASH_UPPER_BOUND);
      k.surfaceType(face);
      k.getSurfaceArea(face);
      k.getSurfaceCenterOfMass(face);
    }
    const afterDescribe = performance.now();

    phases.push({
      boolean: afterBoolean - beforeBoolean,
      describeFaces: afterDescribe - afterBoolean,
      faces: faces.length,
    });
  }

  k.releaseSince(mark);
  return phases;
}

function total(phases: readonly Phase[], key: 'boolean' | 'describeFaces'): number {
  return phases.reduce((sum, phase) => sum + phase[key], 0);
}

async function main(): Promise<void> {
  console.log('\nWhere a rebuild spends its time\n');
  const k = await OcctKernel.init();

  // Warm up the JIT.
  buildTimed(k, 4);

  console.log(
    `${'pockets'.padStart(8)}  ${'faces'.padStart(6)}  ${'booleans'.padStart(9)}  ` +
      `${'describe'.padStart(9)}  ${'total'.padStart(8)}  ${'describe %'.padStart(10)}`,
  );
  console.log('-'.repeat(62));

  for (const count of [5, 10, 20, 40]) {
    const phases = buildTimed(k, count);
    const booleans = total(phases, 'boolean');
    const describe = total(phases, 'describeFaces');
    const sum = booleans + describe;
    const faces = phases[phases.length - 1]?.faces ?? 0;

    console.log(
      `${String(count).padStart(8)}  ${String(faces).padStart(6)}  ` +
        `${booleans.toFixed(1).padStart(9)}  ${describe.toFixed(1).padStart(9)}  ` +
        `${sum.toFixed(1).padStart(8)}  ${((describe / sum) * 100).toFixed(0).padStart(9)}%`,
    );
  }

  // Cost of a single cut as a function of the body's existing complexity.
  console.log('\ncost of a single cut, against how complex the body already is:\n');
  console.log(
    `${'pockets before'.padStart(15)}  ${'faces'.padStart(6)}  ${'this cut'.padStart(9)}`,
  );
  console.log('-'.repeat(34));

  for (const before of [0, 5, 10, 20, 40]) {
    const phases = buildTimed(k, before + 1);
    const last = phases[phases.length - 1];
    if (last === undefined) continue;
    console.log(
      `${String(before).padStart(15)}  ${String(last.faces).padStart(6)}  ` +
        `${last.boolean.toFixed(2).padStart(9)}`,
    );
  }

  console.log(
    '\n--- what to look for ---\n\n' +
      '  If "describe %" climbs with pocket count, the growth is partly OUR\n' +
      '  bookkeeping — rebuild() describes every face after every feature, which\n' +
      '  is O(N^2) over a history, and that is entirely ours to fix.\n\n' +
      '  If a single cut gets steadily more expensive as the body gains faces,\n' +
      "  that part is OCCT's and the only levers are batching or build flags.\n",
  );

  k[Symbol.dispose]();
}

main().catch((error: unknown) => {
  console.error('spike failed:', error);
  process.exitCode = 1;
});
