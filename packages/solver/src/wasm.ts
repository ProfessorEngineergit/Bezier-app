/**
 * Loads the planegcs WebAssembly module. The only file that imports `@salusoft89/planegcs`
 * (ADR 0004). planegcs is LGPL without a linking exception, so `planegcs.wasm` stays a separate
 * file loaded from a configurable URL (ADR 0003).
 */

import { type GcsWrapper, make_gcs_wrapper } from '@salusoft89/planegcs';

export interface PlanegcsLoadOptions {
  /** URL of `planegcs.wasm`; defaults to the package's. */
  wasmUrl?: string | undefined;
}

/**
 * Creates a planegcs instance. Instances are cheap and stateful, so each sketch gets its own.
 * The caller must dispose it.
 */
export function loadPlanegcs(options: PlanegcsLoadOptions = {}): Promise<GcsWrapper> {
  return options.wasmUrl === undefined ? make_gcs_wrapper() : make_gcs_wrapper(options.wasmUrl);
}

export { DebugMode, SolveStatus as GcsSolveStatus } from '@salusoft89/planegcs';
export type { GcsWrapper };
