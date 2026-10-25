/**
 * Spike: how much of a ~4 ms boolean is OCCT and how much is our wrapper (handle tracking, face
 * hashing, history decoding)?
 *
 * Run: node --experimental-strip-types tools/spikes/kernel-headroom.ts
 *
 * Result (occt-wasm 3.8.3 / OCCT 8.0.1, Apple Silicon, Node):
 *
 *   1. Wrapper overhead is negligible (history bookkeeping within noise, face hashing 0.003 ms,
 *      construction 0.037 ms); 99% of a 4.2 ms cut is inside OCCT.
 *   2. Per-cut cost grows with body detail: 3.89 / 4.22 / 4.76 / 5.88 ms for the 1st / 2nd / 4th /
 *      8th sequential cut, so history cost is not linear in feature count.
 *   3. Batching with cutAll is 3–4x faster (4 cuts: 18.9 vs. 6.4 ms; 8 cuts: 47.2 vs. 12.3 ms),
 *      since OCCT intersects all tools in one pass.
 *
 *   The 3.8.3 .wasm has no SIMD and no threads, and occt-wasm does not expose
 *   BOPAlgo_Options::SetRunParallel. 5.x builds have SIMD.
 */

import { OcctKernel } from 'occt-wasm';

const HASH_UPPER_BOUND = 1_000_003;
const RUNS = 200;

function time(label: string, work: () => void): number {
  // Warm up the JIT.
  for (let i = 0; i < 20; i++) work();

  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const started = performance.now();
    work();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length / 2)] ?? Number.NaN;
  console.log(`  ${label.padEnd(42)} ${p50.toFixed(3)} ms`);
  return p50;
}

async function main(): Promise<void> {
  console.log('\nOCCT headroom spike — where does a boolean actually spend its time?\n');
  const k = await OcctKernel.init();

  // Two overlapping boxes: the simplest real boolean.
  const makePair = () => {
    const mark = k.checkpoint();
    const base = k.makeBox(40, 60, 20);
    const tool = k.makeBoxFromCorners({ x: 10, y: 10, z: -5 }, { x: 25, y: 30, z: 15 });
    return { base, tool, mark };
  };

  console.log('one cut, measured three ways:\n');

  const plainCut = time('cut (no history)', () => {
    const { base, tool, mark } = makePair();
    k.cut(base, tool);
    k.releaseSince(mark);
  });

  const historyCut = time('cutWithHistory', () => {
    const { base, tool, mark } = makePair();
    const hashes = k.subShapeHashes(base, 'face', HASH_UPPER_BOUND);
    k.cutWithHistory(base, tool, hashes, HASH_UPPER_BOUND);
    k.releaseSince(mark);
  });

  const construction = time('box construction only (no boolean)', () => {
    const { mark } = makePair();
    k.releaseSince(mark);
  });

  const hashing = time('face hashing only', () => {
    const { base, mark } = makePair();
    k.subShapeHashes(base, 'face', HASH_UPPER_BOUND);
    k.releaseSince(mark);
  });

  console.log('\nwhat that means:\n');
  const booleanOnly = plainCut - construction;
  const historyCost = historyCut - plainCut;

  console.log(`  boolean itself            ${booleanOnly.toFixed(3)} ms`);
  console.log(
    `  history bookkeeping       ${historyCost.toFixed(3)} ms  (${((historyCost / historyCut) * 100).toFixed(0)}% of the call)`,
  );
  console.log(`  shape construction        ${construction.toFixed(3)} ms`);
  console.log(`  face hashing              ${(hashing - construction).toFixed(3)} ms`);

  console.log('\nheadroom:\n');
  if (historyCost > booleanOnly * 0.25) {
    console.log(
      '  History tracking is a significant share of the call. That is OUR cost,\n' +
        "  not OCCT's, and it is worth attacking before anything else.",
    );
  } else {
    console.log(
      "  History tracking is cheap. The cost is inside OCCT's boolean, which we\n" +
        '  do not control from JavaScript — the levers there are build flags\n' +
        '  (SIMD, threads) or doing fewer booleans.',
    );
  }

  // Fixed overhead versus geometry-dependent cost decides whether batching helps.
  console.log('\ncost against input complexity:\n');
  for (const cuts of [1, 2, 4, 8]) {
    const p50 = time(`${cuts} sequential cuts`, () => {
      const mark = k.checkpoint();
      let body = k.makeBox(100, 100, 20);
      for (let i = 0; i < cuts; i++) {
        const tool = k.makeBoxFromCorners(
          { x: 5 + i * 10, y: 5, z: -5 },
          { x: 12 + i * 10, y: 40, z: 15 },
        );
        body = k.cut(body, tool);
      }
      k.releaseSince(mark);
    });
    console.log(`      → ${(p50 / cuts).toFixed(3)} ms per cut`);
  }

  // Sequential cuts versus cutAll, which intersects all tools in one pass.
  console.log('\nsequential vs batched:\n');

  const tools = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      k.makeBoxFromCorners({ x: 5 + i * 10, y: 5, z: -5 }, { x: 12 + i * 10, y: 40, z: 15 }),
    );

  for (const n of [4, 8]) {
    const sequential = time(`${n} cuts, one at a time`, () => {
      const mark = k.checkpoint();
      let body = k.makeBox(100, 100, 20);
      for (const tool of tools(n)) body = k.cut(body, tool);
      k.releaseSince(mark);
    });

    const batched = time(`${n} cuts, batched (cutAll)`, () => {
      const mark = k.checkpoint();
      const body = k.makeBox(100, 100, 20);
      k.cutAll(body, tools(n));
      k.releaseSince(mark);
    });

    console.log(`      → batching is ${(sequential / batched).toFixed(2)}x faster\n`);
  }

  k[Symbol.dispose]();
}

main().catch((error: unknown) => {
  console.error('spike failed:', error);
  process.exitCode = 1;
});
