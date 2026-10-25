/**
 * Spike: should consecutive boolean features be batched?
 *
 * Batching is 3–4x faster on a cold build (see kernel-headroom.ts), but leaves no per-feature
 * bodies for the incremental rebuild cache (ADR 0007), so an edit inside a batch reruns the whole
 * batch. This compares both on cold builds and on edits to the last and first feature.
 *
 * Run: node --experimental-strip-types tools/spikes/batching-vs-cache.ts
 *
 * Result (occt-wasm 3.8.3, Apple Silicon, Node): see the printed verdict and docs/performance.md.
 */

import { OcctKernel } from 'occt-wasm';

const RUNS = 30;

function time(label: string, work: () => void): number {
  for (let i = 0; i < 5; i++) work();
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const started = performance.now();
    work();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length / 2)] ?? Number.NaN;
  console.log(`  ${label.padEnd(46)} ${p50.toFixed(2)} ms`);
  return p50;
}

async function main(): Promise<void> {
  console.log('\nBatching versus the incremental cache\n');
  const k = await OcctKernel.init();

  const POCKETS = 12;
  const toolAt = (i: number, depth: number) =>
    k.makeBoxFromCorners({ x: 5 + i * 8, y: 5, z: -5 }, { x: 10 + i * 8, y: 40, z: depth });

  console.log(`cold build of ${POCKETS} pockets:\n`);

  const coldSequential = time('sequential (what we do today)', () => {
    const mark = k.checkpoint();
    let body = k.makeBox(120, 60, 20);
    for (let i = 0; i < POCKETS; i++) body = k.cut(body, toolAt(i, 15));
    k.releaseSince(mark);
  });

  const coldBatched = time('batched (cutAll)', () => {
    const mark = k.checkpoint();
    const body = k.makeBox(120, 60, 20);
    k.cutAll(
      body,
      Array.from({ length: POCKETS }, (_, i) => toolAt(i, 15)),
    );
    k.releaseSince(mark);
  });

  console.log(
    `      → batching wins the cold build by ${(coldSequential / coldBatched).toFixed(1)}x\n`,
  );

  // Edit one pocket. Sequential can resume from the cached body before it; batched reruns all.
  console.log('changing the depth of ONE pocket:\n');

  // Editing the last pocket (the common case) reruns one operation with per-feature caching.
  const cachedEdit = time('sequential + cache (rerun the last pocket)', () => {
    const mark = k.checkpoint();
    // Stand-in for the cached body before the last cut.
    let body = k.makeBox(120, 60, 20);
    for (let i = 0; i < POCKETS - 1; i++) body = k.cut(body, toolAt(i, 15));
    const resume = body;
    k.checkpoint();
    k.cut(resume, toolAt(POCKETS - 1, 16));
    k.releaseSince(mark);
  });

  // The above includes rebuilding the prefix, which a real cache skips; measure it to subtract.
  const prefix = time('  (of which: rebuilding the cached prefix)', () => {
    const mark = k.checkpoint();
    let body = k.makeBox(120, 60, 20);
    for (let i = 0; i < POCKETS - 1; i++) body = k.cut(body, toolAt(i, 15));
    k.releaseSince(mark);
  });

  const batchedEdit = time('batched (no per-feature body — rerun all)', () => {
    const mark = k.checkpoint();
    const body = k.makeBox(120, 60, 20);
    k.cutAll(
      body,
      Array.from({ length: POCKETS }, (_, i) => toolAt(i, i === POCKETS - 1 ? 16 : 15)),
    );
    k.releaseSince(mark);
  });

  const cacheResume = cachedEdit - prefix;
  console.log(`\n      → a cached edit costs ${cacheResume.toFixed(2)} ms`);
  console.log(`      → the same edit, batched, costs ${batchedEdit.toFixed(2)} ms`);
  console.log(
    `      → batching makes the common path ${(batchedEdit / cacheResume).toFixed(1)}x SLOWER\n`,
  );

  // Editing the first pocket: nothing to resume from, so every cut reruns. Batching costs the same
  // regardless of which pocket changed.
  console.log('changing the FIRST pocket:\n');

  const editFirstSequential = time('sequential + cache (everything reruns)', () => {
    const mark = k.checkpoint();
    let body = k.makeBox(120, 60, 20);
    for (let i = 0; i < POCKETS; i++) body = k.cut(body, toolAt(i, i === 0 ? 16 : 15));
    k.releaseSince(mark);
  });

  console.log(
    `\n      → cached: ${editFirstSequential.toFixed(2)} ms, batched: ${batchedEdit.toFixed(2)} ms` +
      ` — batching is ${(editFirstSequential / batchedEdit).toFixed(1)}x FASTER here\n`,
  );

  console.log('--- verdict ---\n');
  const coldGain = coldSequential - coldBatched;
  const editLoss = batchedEdit - cacheResume;

  console.log(`  batching saves ${coldGain.toFixed(1)} ms on a cold build`);
  console.log(`  batching costs ${editLoss.toFixed(1)} ms on every edit\n`);

  console.log('  on the three paths that matter:\n');
  console.log(
    `    cold build   sequential ${coldSequential.toFixed(1)}  batched ${coldBatched.toFixed(1)}`,
  );
  console.log(
    `    edit last    sequential ${cacheResume.toFixed(1)}  batched ${batchedEdit.toFixed(1)}`,
  );
  console.log(
    `    edit first   sequential ${editFirstSequential.toFixed(1)}  batched ${batchedEdit.toFixed(1)}`,
  );

  const wins = [
    coldSequential > coldBatched,
    cacheResume > batchedEdit,
    editFirstSequential > batchedEdit,
  ];
  console.log(`\n  batching wins ${wins.filter(Boolean).length} of 3.\n`);

  console.log(
    '  Batching is flat: it costs the same whichever feature changed, because it\n' +
      '  never depended on per-feature intermediates. Caching is spiky — excellent\n' +
      '  when the edit is late in the history, no help at all when it is early.\n\n' +
      '  The blocker is not performance. It is that a batched call returns ONE\n' +
      '  EvolutionData for the whole batch, and the naming layer needs per-feature\n' +
      '  attribution. Recovering that means deciding which tool produced each new\n' +
      '  face — exact for disjoint pockets, ambiguous for overlapping ones, and\n' +
      '  precisely the fuzzy matching ADR 0001 warned against putting in the path\n' +
      '  of the naming layer.',
  );

  k[Symbol.dispose]();
}

main().catch((error: unknown) => {
  console.error('spike failed:', error);
  process.exitCode = 1;
});
