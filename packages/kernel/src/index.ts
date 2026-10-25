/**
 * @bezier/kernel: the geometry layer. Wraps OCCT (compiled to WebAssembly) behind a
 * small, typed API that reports failure. Nothing above this package knows OCCT exists.
 * See ./README.md and ../../docs/adr/0001-geometry-kernel.md.
 */

export {
  type BackgroundImport,
  cancelBackgroundReads,
  readStepInBackground,
} from './background-import.js';
export { importBudgetMs } from './budget.js';
export type { KernelError, KernelErrorCode, KernelResult } from './errors.js';
export { err, isRecoverable, ok } from './errors.js';
export type { FaceOutline } from './face-outlines.js';
export type {
  GeometryKernel,
  ImportOptions,
  KernelOptions,
  MassProperties,
  Profile,
  ProfilePoint,
  ProfileSegment,
  StepPart,
} from './kernel.js';
export type { DrawingDirection, DrawingProjection } from './projection.js';
export type { ShapeStore } from './shape-store.js';
export { rememberTextKey, textKey } from './shape-store.js';
export { parseStepOutline } from './step-outline.js';
export type {
  Bounds,
  CylindricalFace,
  EdgeSet,
  EvolutionData,
  FaceDescription,
  FaceEvolution,
  FaceHash,
  FaceMeasurement,
  Mesh,
  MeshPiece,
  PartMotion,
  ShapeId,
  ShapeWithHistory,
  TessellationOptions,
  Vec3,
} from './types.js';
export { DEFAULT_TESSELLATION } from './types.js';
/**
 * `worker/browser.js` is not re-exported: a static export would defeat the dynamic `import()` in
 * `createKernel` (bundler warning INEFFECTIVE_DYNAMIC_IMPORT). It is the only file touching DOM
 * globals, so keeping it dynamic lets Node load this package.
 */
/**
 * Neither the in-process kernel nor the WASM loader is re-exported: both statically import
 * `occt-wasm` and would pull the whole OCCT wrapper into every bundle. Tests, benchmarks and
 * Node import `@bezier/kernel/occt` instead.
 */
export { WorkerKernel } from './worker/client.js';
export { transferablesOf } from './worker/protocol.js';
export type { SupervisedWorker, SupervisorOptions, WorkerFactory } from './worker/supervisor.js';
export { WorkerSupervisor } from './worker/supervisor.js';

/**
 * Starts the kernel. In a browser this spawns a supervised Web Worker, so geometry never blocks
 * the UI (ADR 0007) and an uncatchable OCCT abort kills only the worker (ADR 0009). Elsewhere it
 * runs in-process. Both implement `GeometryKernel`.
 */
export async function createKernel(
  options?: import('./kernel.js').KernelOptions & {
    /** Force in-process execution, for tests and benchmarks. */
    inProcess?: boolean;
    /** Told when the worker had to be restarted, so the caller can rebuild. */
    onRestart?: (reason: string) => void;
    /** Parts of a large mesh while it is being made (`MeshPiece`). */
    onPiece?: (piece: import('./types.js').MeshPiece) => void;
  },
): Promise<import('./kernel.js').GeometryKernel> {
  const { areWorkersAvailable, spawnKernelWorker } = await import('./worker/browser.js');

  if (options?.inProcess === true || !areWorkersAvailable()) {
    const { createOcctKernel } = await import('./occt-kernel.js');
    return createOcctKernel(options?.wasmUrl === undefined ? {} : { wasmUrl: options.wasmUrl });
  }

  const { WorkerSupervisor } = await import('./worker/supervisor.js');
  const { WorkerKernel } = await import('./worker/client.js');

  const supervisor = new WorkerSupervisor(() => spawnKernelWorker(options?.wasmUrl), {
    ...(options?.onRestart === undefined ? {} : { onRestart: options.onRestart }),
    ...(options?.onPiece === undefined ? {} : { onPiece: options.onPiece }),
  });
  return new WorkerKernel(supervisor);
}
