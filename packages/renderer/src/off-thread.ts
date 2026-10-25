/**
 * Builds a large mesh's picking tree and seams in a worker (`geometry-worker.ts`). Returns null
 * where workers are unavailable; the caller then builds them itself.
 */

/// <reference lib="dom" />

import type { Mesh } from '@bezier/kernel';
import { Bvh } from './bvh.js';
import type { CornerTable } from './corner-table.js';
import type { GeometryJob, GeometryResult } from './geometry-worker.js';
import type { SeamTable } from './seams.js';

/** What another thread built for a mesh. */
export interface Built {
  bvh: Bvh;
  seams: SeamTable;
  corners: CornerTable;
}

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, (result: GeometryResult) => void>();

function geometryWorker(): Worker | null {
  if (worker !== null) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./geometry-worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  worker.addEventListener('message', (event: MessageEvent<GeometryResult>) => {
    const resolve = waiting.get(event.data.id);
    waiting.delete(event.data.id);
    resolve?.(event.data);
  });
  return worker;
}

/** Results per mesh object, so a mesh handed back again (e.g. after Undo) reuses its tree. */
const built = new WeakMap<Mesh, Promise<Built>>();

/** The tree and seams for `mesh`, from another thread; null if there is none. */
export function buildOffThread(mesh: Mesh): Promise<Built> | null {
  const known = built.get(mesh);
  if (known !== undefined) return known;
  const target = geometryWorker();
  if (target === null) return null;
  const id = nextId++;
  const job = new Promise<Built>((resolve) => {
    waiting.set(id, (result) =>
      resolve({
        bvh: new Bvh(mesh.positions, mesh.indices, result.bvh),
        seams: result.seams,
        corners: result.corners,
      }),
    );
    // Copied, not transferred: the positions and indices stay here to be drawn.
    const message: GeometryJob = {
      id,
      positions: mesh.positions,
      indices: mesh.indices,
      triangleFaces: mesh.triangleFaces,
    };
    target.postMessage(message);
  });
  built.set(mesh, job);
  return job;
}
