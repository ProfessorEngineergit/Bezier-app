/**
 * Times a large STEP import through `rebuild()` with the real kernel, counting and timing every
 * kernel call, then times common edits on top of it (add a part, move a part, round an edge).
 *
 * Run: pnpm --filter @bezier/bench large-import /path/to/file.step [store-dir]
 *
 * With a store directory the imported shape is cached there like the app's OPFS store, so a second
 * run measures reopening the project.
 *
 * Reference file: the Voron 2.4r2 printer assembly (241 MB, 1715 solids, GPL-3.0,
 * github.com/VoronDesign/Voron-2).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { type CadDocument, createEmptyDocument, RebuildCache, rebuild } from '@bezier/core';
import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { fixedSolver, rectangleSketch } from './corpus.ts';
import { directoryStore } from './directory-store.ts';

/** Wraps the kernel so that every call is counted and timed. */
function timed(kernel: GeometryKernel) {
  const spent = new Map<string, { calls: number; ms: number }>();
  const proxy = new Proxy(kernel, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        const started = performance.now();
        // Log before the call so long-running calls are visible.
        if (process.env.TRACE !== undefined) console.log(`  → ${String(key)}`);
        try {
          const result = await (value as (...a: unknown[]) => unknown).apply(target, args);
          const failed = result as { ok?: boolean; error?: { detail?: string } } | undefined;
          if (process.env.TRACE_EDGES !== undefined && failed?.ok === false) {
            console.log(`  ✗ ${String(key)}: ${failed.error?.detail ?? ''}`.slice(0, 240));
          }
          return result;
        } finally {
          const entry = spent.get(String(key)) ?? { calls: 0, ms: 0 };
          entry.calls += 1;
          entry.ms += performance.now() - started;
          spent.set(String(key), entry);
        }
      };
    },
  });
  return { kernel: proxy, spent };
}

/** A small part beside the model. */
const besideIt: CadDocument['features'] = [
  {
    id: 'sketch-1',
    type: 'sketch',
    name: 'Sketch',
    params: {
      plane: 'XY',
      sketch: rectangleSketch('s', { x: -200, y: -200, width: 20, height: 20 }),
    },
  },
  {
    id: 'extrude-1',
    type: 'extrude',
    name: 'Extrude',
    params: { sketch: 'sketch-1', distance: 10, direction: 'forward', operation: 'new' },
  },
];

async function main(): Promise<void> {
  const [file, storeDirectory] = process.argv.slice(2);
  if (file === undefined) throw new Error('usage: large-import <file.step> [store-dir]');
  const text = readFileSync(file, 'utf8');
  const store = storeDirectory === undefined ? undefined : directoryStore(storeDirectory);
  const { kernel, spent } = timed(await createOcctKernel(store === undefined ? {} : { store }));
  // One cache per session, as in the app, so later rebuilds reuse the import.
  const deps = { kernel, solver: fixedSolver(), cache: new RebuildCache() };
  const imported: CadDocument['features'] = [
    // Faces named in file order, as for a new import in the app (see import-step.ts).
    {
      id: 'import-1',
      type: 'import-step',
      name: 'Import',
      params: { file: text, faceOrder: 'file' },
    },
  ];
  console.log(`\n${file}\n${(text.length / 1e6).toFixed(1)} MB`);

  const phase = async (label: string, features: CadDocument['features']) => {
    spent.clear();
    const started = performance.now();
    const result = await rebuild({ ...createEmptyDocument('Bench'), features }, deps);
    const total = performance.now() - started;
    const triangles = result.mesh === null ? 'none' : String(result.mesh.indices.length / 3);
    const states = [...result.statuses.values()].map((status) => status.state).join(', ');
    console.log(`\n${label}: ${Math.round(total)} ms, ${triangles} triangles, [${states}]`);
    console.log(`rss ${Math.round(process.memoryUsage().rss / 1e6)} MB`);
    for (const [name, { calls, ms }] of [...spent].sort((x, y) => y[1].ms - x[1].ms)) {
      console.log(
        `  ${name.padEnd(18)} ${String(calls).padStart(6)} calls ${String(Math.round(ms)).padStart(8)} ms`,
      );
    }
  };

  await phase('import', imported);
  // BENCH_DUMP=/path/prefix writes the mesh and edges, for benchmarking the main-thread side.
  const dump = process.env.BENCH_DUMP;
  if (dump !== undefined) {
    const shown = await rebuild({ ...createEmptyDocument('Bench'), features: imported }, deps);
    const mesh = shown.mesh;
    if (mesh !== null) {
      writeFileSync(`${dump}.positions`, mesh.positions);
      writeFileSync(`${dump}.indices`, mesh.indices);
      writeFileSync(`${dump}.faces`, mesh.triangleFaces);
      if (shown.edges !== null) {
        writeFileSync(`${dump}.edges`, shown.edges.positions);
        writeFileSync(`${dump}.starts`, shown.edges.polylineStarts);
      }
    }
  }
  await phase('add a part beside it', [...imported, ...besideIt]);
  // Move one part, twice: the second run measures the edit alone with the import cached.
  const moved = (dx: number): CadDocument['features'] => [
    ...imported,
    {
      id: 'move-1',
      type: 'move',
      name: 'Move',
      params: { dx, dy: 0, dz: 0, faces: [`F:import-1:face-${process.env.MOVE_FACE ?? 0}`] },
    },
  ];
  await phase('move one part', moved(20));
  await phase('move it again', moved(40));
  // Round one edge: the first edge between the first faces that accepts a small fillet, or the edge
  // given as EDGE=F:…|F:….
  const FIRST = Number(process.env.FIRST_FACE ?? 0);
  const candidates =
    process.env.EDGE === undefined
      ? Array.from({ length: 12 }, (_, i) =>
          Array.from(
            { length: 11 - i },
            (_, k) => `F:import-1:face-${FIRST + i}|F:import-1:face-${FIRST + i + k + 1}`,
          ),
        ).flat()
      : [process.env.EDGE];
  for (const edge of candidates) {
    const rounded = [
      ...imported,
      {
        id: 'fillet-1',
        type: 'fillet',
        name: 'Fillet',
        params: { edges: [`E(${edge})`], radius: 0.2 },
      },
    ];
    const probe = await rebuild({ ...createEmptyDocument('Bench'), features: rounded }, deps);
    const state = probe.statuses.get('fillet-1');
    if (process.env.TRACE_EDGES !== undefined)
      console.log(edge, JSON.stringify(state).slice(0, 300));
    if (state?.state !== 'ok') continue;
    console.log(`\nedge ${edge}`);
    // Change the radius so the timing excludes the probe.
    const again = rounded.map((f) =>
      f.id === 'fillet-1' ? { ...f, params: { ...f.params, radius: 0.25 } } : f,
    );
    await phase('round an edge of one part', again);
    break;
  }
}

await main();
