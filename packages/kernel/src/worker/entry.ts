/**
 * The worker side: an OCCT kernel and a loop that answers calls, with no policy or retries.
 * Supervision is in `supervisor.ts` on the main thread, since the failure it handles kills this
 * worker mid-instruction.
 */

/// <reference lib="dom" />
// DOM types per file, not per package: dependents typecheck these sources under their own
// config, which a lib setting here would not reach, and widening theirs would admit browser APIs.

import type { GeometryKernel } from '../kernel.js';
import { createOcctKernel } from '../occt-kernel.js';
import { opfsShapeStore } from './opfs-shapes.js';
import { type KernelMethod, transferablesOf } from './protocol.js';

/**
 * The worker's global scope, declared narrowly. The `WebWorker` lib collides with `DOM`
 * on globals they both define, and only these three members are used.
 */
interface WorkerScope {
  addEventListener(type: 'message', handler: (event: MessageEvent) => void): void;
  postMessage(message: unknown, options?: { transfer?: Transferable[] }): void;
}

const scope = globalThis as unknown as WorkerScope;

let kernel: GeometryKernel | null = null;
let loading: Promise<GeometryKernel> | null = null;

let lastAlive = 0;

/**
 * Tells the supervisor the worker is alive, rearming every waiting call. At most once a second,
 * since deadlines are tens of seconds. `budgetMs` announces how long the next piece may run silent.
 */
function alive(budgetMs?: number): void {
  const now = performance.now();
  // A budget is always sent: nothing can be sent while the heavy piece runs.
  if (budgetMs === undefined && now - lastAlive < 1000) return;
  lastAlive = now;
  scope.postMessage(budgetMs === undefined ? { kind: 'alive' } : { kind: 'alive', budgetMs });
}

function load(wasmUrl?: string): Promise<GeometryKernel> {
  const store = opfsShapeStore();
  loading ??= createOcctKernel({
    ...(wasmUrl === undefined ? {} : { wasmUrl }),
    ...(store === undefined ? {} : { store }),
    alive,
    // Parts of a large model as they are meshed; moved, not copied.
    stream: (piece) =>
      scope.postMessage(
        { kind: 'piece', piece },
        { transfer: [piece.positions.buffer, piece.normals.buffer, piece.indices.buffer] },
      ),
  }).then((created) => {
    kernel = created;
    return created;
  });
  return loading;
}

scope.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as {
    kind: string;
    id?: number;
    method?: KernelMethod;
    args?: unknown[];
    wasmUrl?: string;
  };

  if (message.kind === 'init') {
    // Load now, not on the first call, so the 4.7 MB download overlaps with other work.
    void load(message.wasmUrl);
    return;
  }

  if (message.kind !== 'call' || message.id === undefined || message.method === undefined) return;
  void answer(message.id, message.method, message.args ?? []);
});

async function answer(id: number, method: KernelMethod, args: unknown[]): Promise<void> {
  try {
    const active = kernel ?? (await load());
    const fn = (active as unknown as Record<string, (...a: unknown[]) => unknown>)[method];

    if (typeof fn !== 'function') {
      scope.postMessage({ kind: 'fault', id, message: `unknown kernel method "${method}"` });
      return;
    }

    const result = await fn.apply(active, args);

    // Geometry payloads are transferred, not copied (see protocol.ts).
    scope.postMessage({ kind: 'result', id, result }, { transfer: transferablesOf(result) });
  } catch (error) {
    // A thrown error is a bug, not a geometry failure (those return a KernelResult); report it as
    // a fault so the supervisor can tell them apart.
    scope.postMessage({
      kind: 'fault',
      id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
