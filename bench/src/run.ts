/**
 * Main benchmark: rebuild time across the corpus, scaling with history length, incremental
 * rebuild after an edit, and a kernel-time breakdown.
 *
 * Run: pnpm bench
 */

import { RebuildCache, rebuild } from '@bezier/core';
import { createOcctKernel } from '@bezier/kernel/occt';
import { blockWithPockets, CORPUS, editPocket, fixedSolver } from './corpus.ts';
import type { Measurement } from './harness.ts';
import { checkBudget, measure, reportTable } from './harness.ts';

async function main(): Promise<void> {
  console.log('\nBezier benchmarks\n');

  const loadStarted = performance.now();
  const kernel = await createOcctKernel();
  const loadMs = performance.now() - loadStarted;
  console.log(`kernel cold load: ${loadMs.toFixed(0)} ms  (budget 3000 ms)\n`);

  const solver = fixedSolver();
  const deps = { kernel, solver };
  const results: Measurement[] = [];

  for (const [name, document] of Object.entries(CORPUS)) {
    results.push(
      await measure(
        `rebuild · ${name} (${document.features.length} features)`,
        () => rebuild(document, deps),
        { runs: 10, warmup: 2 },
      ),
    );
  }

  reportTable(results);

  // Cost per feature should stay roughly flat; growth indicates quadratic behavior.
  console.log('scaling — cost per feature as history grows\n');
  console.log(
    `${'features'.padStart(9)}  ${'total p50'.padStart(10)}  ${'per feature'.padStart(12)}`,
  );
  console.log('-'.repeat(36));

  for (const pockets of [1, 5, 10, 20, 40]) {
    const document = blockWithPockets(pockets);
    const m = await measure(`scale-${pockets}`, () => rebuild(document, deps), {
      runs: 5,
      warmup: 1,
    });
    const perFeature = m.p50 / document.features.length;
    console.log(
      `${String(document.features.length).padStart(9)}  ${m.p50.toFixed(1).padStart(10)}  ${perFeature.toFixed(2).padStart(12)}`,
    );
  }

  // Incremental rebuild: editing one feature must not pay for the whole history.
  console.log('incremental rebuild — editing one feature of a warm history\n');
  console.log(
    `${'history'.padStart(9)}  ${'cold p50'.padStart(9)}  ${'edit last'.padStart(10)}  ` +
      `${'edit first'.padStart(11)}  ${'speedup'.padStart(8)}`,
  );
  console.log('-'.repeat(56));

  for (const pockets of [10, 20, 40]) {
    const document = blockWithPockets(pockets);
    const cache = new RebuildCache();

    const cold = await measure(`cold-${pockets}`, () => rebuild(document, deps), {
      runs: 5,
      warmup: 1,
    });

    // Warm the cache, then edit the last pocket (best and most common case).
    await rebuild(document, { ...deps, cache });
    const editLast = await measure(
      `last-${pockets}`,
      () => rebuild(editPocket(document, pockets - 1), { ...deps, cache }),
      { runs: 5, warmup: 1 },
    );

    // Editing the first pocket invalidates everything after it; should be close to cold, not above.
    const editFirst = await measure(
      `first-${pockets}`,
      () => rebuild(editPocket(document, 0), { ...deps, cache }),
      { runs: 5, warmup: 1 },
    );

    console.log(
      `${String(pockets).padStart(9)}  ${cold.p50.toFixed(1).padStart(9)}  ` +
        `${editLast.p50.toFixed(1).padStart(10)}  ${editFirst.p50.toFixed(1).padStart(11)}  ` +
        `${(cold.p50 / editLast.p50).toFixed(1).padStart(7)}x`,
    );

    await cache.clear(kernel);
  }
  console.log('\nall figures in milliseconds\n');

  console.log('\nbreakdown — a single medium rebuild\n');
  const medium = CORPUS.medium;
  const built = await rebuild(medium, deps);
  const body = built.body;
  if (body !== null) {
    const breakdown = [
      await measure('  tessellate', () => kernel.tessellate(body), { runs: 20 }),
      await measure('  extract edges', () => kernel.extractEdges(body), { runs: 20 }),
      await measure('  describe faces', () => kernel.describeFaces(body), { runs: 20 }),
    ];
    reportTable(breakdown);
  }

  console.log('budgets (docs/performance.md)\n');
  const mediumRebuild = results.find((r) => r.name.includes('medium'));
  let allMet = loadMs <= 3000;
  console.log(
    `  ${loadMs <= 3000 ? 'within' : 'OVER  '} kernel cold load: ${loadMs.toFixed(0)} ms against a 3000 ms budget`,
  );
  if (mediumRebuild !== undefined) {
    allMet = checkBudget(mediumRebuild, 100) && allMet;
  }

  console.log(
    `\n${allMet ? 'All measured budgets met.' : 'Some budgets are not met — see above.'}\n`,
  );
}

main().catch((error: unknown) => {
  console.error('benchmark failed:', error);
  process.exitCode = 1;
});
