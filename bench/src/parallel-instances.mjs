/**
 * Measures the speedup from running several OCCT kernels in parallel workers.
 *
 *   pnpm --filter @bezier/bench parallel
 *
 * Separate kernel instances need no SharedArrayBuffer or cross-origin isolation, so this also works
 * in a browser, but only helps with independent work such as several bodies. Each body is a
 * 40 x 20 x 15 box with six cylindrical holes (six booleans), then meshed.
 */

import os from 'node:os';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { OcctKernel } from 'occt-wasm';

const HOLES = 6;

function buildBodies(kernel, count) {
  let triangles = 0;
  for (let i = 0; i < count; i += 1) {
    const mark = kernel.checkpoint();
    let body = kernel.makeBox(40, 20, 15);
    for (let h = 0; h < HOLES; h += 1) {
      const hole = kernel.translate(kernel.makeCylinder(2.2, 30), 4 + h * 6, 10, -5);
      body = kernel.cut(body, hole);
    }
    triangles += kernel.tessellate(body).indices.length / 3;
    kernel.releaseSince(mark);
  }
  return triangles;
}

if (!isMainThread) {
  const kernel = await OcctKernel.init();
  buildBodies(kernel, 2); // warm up
  parentPort.postMessage({ ready: true });
  parentPort.on('message', ({ count }) => {
    parentPort.postMessage({ done: buildBodies(kernel, count) });
  });
} else {
  const BODIES = Number(process.env.BODIES ?? 48);
  const RUNS = Number(process.env.RUNS ?? 5);
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

  const single = await OcctKernel.init();
  buildBodies(single, 2);
  const inProcess = [];
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    buildBodies(single, BODIES);
    inProcess.push(performance.now() - started);
  }
  const base = median(inProcess);

  console.log(
    `${os.cpus().length} cores (${os.cpus()[0]?.model}), ${BODIES} bodies of ${HOLES} holes each, median of ${RUNS}`,
  );
  console.log(
    `one kernel, in this thread: ${base.toFixed(0)} ms (${(base / BODIES).toFixed(1)} ms a body)\n`,
  );
  console.log('workers   wall ms   speedup   efficiency');

  for (const workers of [1, 2, 4, 8]) {
    const pool = await Promise.all(
      Array.from({ length: workers }, () => {
        const worker = new Worker(new URL(import.meta.url));
        return new Promise((resolve) => worker.once('message', () => resolve(worker)));
      }),
    );
    const times = [];
    for (let run = 0; run < RUNS; run += 1) {
      const started = performance.now();
      await Promise.all(
        pool.map(
          (worker) =>
            new Promise((resolve) => {
              worker.once('message', resolve);
              worker.postMessage({ count: BODIES / workers });
            }),
        ),
      );
      times.push(performance.now() - started);
    }
    const wall = median(times);
    const speedup = base / wall;
    console.log(
      `${String(workers).padStart(7)}   ${wall.toFixed(0).padStart(7)}   ${speedup.toFixed(2).padStart(6)}x   ${((speedup / workers) * 100).toFixed(0).padStart(6)} %`,
    );
    await Promise.all(pool.map((worker) => worker.terminate()));
  }
  process.exit(0);
}
