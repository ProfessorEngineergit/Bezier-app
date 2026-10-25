/**
 * A real Web Worker behind the supervisor's interface. Kept thin: timeouts, restarts and the
 * circuit breaker live in `supervisor.ts`, where they are tested against a fake.
 */

/// <reference lib="dom" />
// DOM types per file, not per package: dependents typecheck these sources under their own
// config, which a lib setting here would not reach, and widening theirs would admit browser APIs.

import type { Bounds, EdgeSet } from '../types.js';
import type { SupervisedWorker } from './supervisor.js';

class BrowserWorker implements SupervisedWorker {
  readonly #worker: Worker;

  constructor(worker: Worker) {
    this.#worker = worker;
  }

  post(message: unknown, transfer?: Transferable[]): void {
    // Transfer instead of copy: a mesh is megabytes and cloning it costs more than making it
    // (ADR 0007).
    this.#worker.postMessage(message, transfer ?? []);
  }

  onMessage(handler: (message: unknown) => void): void {
    this.#worker.addEventListener('message', (event) => handler(event.data));
  }

  onFailure(handler: (reason: string) => void): void {
    // Uncaught worker errors, including WASM aborts, which cannot be caught as exceptions; hence
    // the kernel runs in a worker (ADR 0009).
    this.#worker.addEventListener('error', (event) => {
      handler(event.message === '' ? 'the geometry engine stopped unexpectedly' : event.message);
    });
    this.#worker.addEventListener('messageerror', () => {
      handler('a message from the geometry engine could not be read');
    });
  }

  terminate(): void {
    this.#worker.terminate();
  }
}

/**
 * Starts a kernel worker. The `new URL(..., import.meta.url)` form lets the bundler emit the entry
 * as its own chunk; a plain string path fails at runtime with a 404.
 */
export function spawnKernelWorker(wasmUrl?: string): SupervisedWorker {
  const worker = new Worker(new URL('./entry.js', import.meta.url), {
    type: 'module',
    name: 'bezier-kernel',
  });
  worker.postMessage({ kind: 'init', wasmUrl });
  return new BrowserWorker(worker);
}

/**
 * A STEP file's rough outline, read from its text in a worker of its own
 * (`outline-entry.ts`); null when it holds none this reader can follow.
 */
export function readOutlineOffThread(
  text: string,
): Promise<{ edges: EdgeSet; box: Bounds } | null> {
  const worker = new Worker(new URL('./outline-entry.js', import.meta.url), {
    type: 'module',
    name: 'bezier-outline',
  });
  return new Promise<{ edges: EdgeSet; box: Bounds } | null>((resolve) => {
    worker.addEventListener('message', (event) => resolve(event.data));
    worker.addEventListener('error', () => resolve(null));
    worker.postMessage(text);
  }).finally(() => worker.terminate());
}

/**
 * Whether a shape read in one worker can be handed to another via the private file system, which
 * must actually open: WebKit refuses it in a restricted profile, and WebKit on Linux has none.
 */
export async function canKeepShapes(): Promise<boolean> {
  if (typeof navigator === 'undefined' || navigator.storage?.getDirectory === undefined)
    return false;
  try {
    await navigator.storage.getDirectory();
    return true;
  } catch {
    return false;
  }
}

/** Whether this environment can host the kernel off the main thread. */
export function areWorkersAvailable(): boolean {
  return typeof Worker !== 'undefined';
}
