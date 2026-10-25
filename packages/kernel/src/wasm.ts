/**
 * Bringing the OCCT WebAssembly module up. The only file allowed to import `occt-wasm`
 * (ADR 0004). The geometry operations are behind `GeometryKernel`.
 *
 * The `.wasm` stays a separate file fetched at runtime from a configurable URL, because
 * OCCT is LGPL and a user has to be able to substitute their own build (ADR 0003).
 */

import { OcctKernel } from 'occt-wasm';

/**
 * Where the 21 MB `.wasm` is served from. `undefined` lets occt-wasm detect it, which
 * works in the browser, in Node and in a worker. Override it to use your own build.
 */
export interface OcctLoadOptions {
  wasmUrl?: string | undefined;
}

let pending: Promise<OcctKernel> | null = null;

/**
 * Load OCCT once per thread and hand back the same instance afterwards. Loading is
 * expensive, so callers share one. It is per thread: the worker gets its own, and the
 * main thread should never own a kernel.
 */
export function loadOcct(options: OcctLoadOptions = {}): Promise<OcctKernel> {
  if (pending === null) {
    pending = OcctKernel.init(options.wasmUrl === undefined ? {} : { wasm: options.wasmUrl });
  }
  return pending;
}

/**
 * Drop the cached instance so the next `loadOcct` starts fresh. Tests only: tearing the
 * kernel down mid-session would invalidate every live shape handle.
 */
export function resetOcctForTesting(): void {
  pending = null;
}
