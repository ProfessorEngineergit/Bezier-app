/**
 * A `GeometryKernel` that runs in a worker, with the same interface as the in-process kernel so
 * callers such as `@bezier/core` cannot tell the difference.
 */

import { importBudgetMs } from '../budget.js';
import type { KernelResult } from '../errors.js';
import { err } from '../errors.js';
import type { FaceOutline } from '../face-outlines.js';
import type { GeometryKernel, ImportOptions, Profile } from '../kernel.js';
import type { MeshedPacket, MeshPacket } from '../mesh-parts.js';
import type {
  Bounds,
  CylindricalFace,
  EdgeSet,
  FaceDescription,
  FaceHash,
  FaceMeasurement,
  Mesh,
  PartMotion,
  ShapeId,
  ShapeWithHistory,
  TessellationOptions,
  Vec3,
} from '../types.js';
import type { KernelMethod } from './protocol.js';
import type { WorkerSupervisor } from './supervisor.js';

export class WorkerKernel implements GeometryKernel {
  readonly #supervisor: WorkerSupervisor;

  constructor(supervisor: WorkerSupervisor) {
    this.#supervisor = supervisor;
  }

  /**
   * Forwards a call, turning a supervision failure (crash, restart) into an ordinary failed
   * `KernelResult`. Core then marks only that feature broken (ADR 0009), with no second recovery
   * path.
   */
  async #call<T>(
    method: KernelMethod,
    args: readonly unknown[],
    timeoutMs?: number,
  ): Promise<KernelResult<T>> {
    this.#asked += 1;
    try {
      return await this.#send<T>(method, args, timeoutMs);
    } finally {
      this.#asked -= 1;
      if (this.#asked === 0) this.#wake();
    }
  }

  /** Calls someone is waiting for; background work yields to these. */
  #asked = 0;
  /** A background call is running; at most one, so an awaited call waits for at most one. */
  #backgroundBusy = false;
  readonly #waiting: (() => void)[] = [];

  #wake(): void {
    for (const resume of this.#waiting.splice(0)) resume();
  }

  /**
   * A call nobody is waiting on, such as finer meshes for close-ups. The worker is serial, so a
   * queue of these delayed user actions by seconds. They run one at a time and only when nothing
   * else is waiting; an awaited call waits for the one in progress only.
   */
  async #background<T>(method: KernelMethod, args: readonly unknown[]): Promise<KernelResult<T>> {
    while (this.#asked > 0 || this.#backgroundBusy) {
      await new Promise<void>((resume) => this.#waiting.push(resume));
    }
    this.#backgroundBusy = true;
    try {
      return await this.#send<T>(method, args);
    } finally {
      this.#backgroundBusy = false;
      this.#wake();
    }
  }

  async #send<T>(
    method: KernelMethod,
    args: readonly unknown[],
    timeoutMs?: number,
  ): Promise<KernelResult<T>> {
    const started = tracing() ? performance.now() : null;
    try {
      return (await this.#supervisor.call(method, args, undefined, timeoutMs)) as KernelResult<T>;
    } catch (error) {
      return err<T>(
        'unknown',
        'The geometry engine stopped and was restarted. This operation was not completed.',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      if (started !== null) traceCall(method, started, performance.now() - started);
    }
  }

  /**
   * Switches to `other`'s worker and its shapes and ends this one, dropping its shapes as `cancel`
   * does. Returns false, changing nothing, when `other` is busy.
   */
  takeOver(other: WorkerKernel): boolean {
    const worker = other.#supervisor.release();
    if (worker === null) return false;
    this.#supervisor.adopt(worker);
    return true;
  }

  /** Stop the work in hand and start the engine afresh; every shape it held is gone. */
  cancel(): void {
    this.#supervisor.cancel();
  }

  extrude(profile: Profile, distance: number, taper?: number): Promise<KernelResult<ShapeId>> {
    return this.#call('extrude', [profile, distance, taper]);
  }

  extrudeFace(face: ShapeId, distance: number): Promise<KernelResult<ShapeId>> {
    return this.#call('extrudeFace', [face, distance]);
  }

  flatOutlines(shape: ShapeId): Promise<KernelResult<FaceOutline[]>> {
    return this.#call('flatOutlines', [shape]);
  }

  wrapTool(face: ShapeId, profile: Profile, depth: number): Promise<KernelResult<ShapeId>> {
    return this.#call('wrapTool', [face, profile, depth]);
  }

  loft(profiles: readonly Profile[], ruled?: boolean): Promise<KernelResult<ShapeId>> {
    return this.#call('loft', [profiles, ruled]);
  }

  sweep(profile: Profile, path: Profile): Promise<KernelResult<ShapeId>> {
    return this.#call('sweep', [profile, path]);
  }

  revolve(
    profile: Profile,
    axisOrigin: Vec3,
    axisDirection: Vec3,
    angleRadians: number,
    pitch?: number,
  ): Promise<KernelResult<ShapeId>> {
    return this.#call('revolve', [profile, axisOrigin, axisDirection, angleRadians, pitch]);
  }

  translate(solid: ShapeId, by: Vec3): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('translate', [solid, by]);
  }

  rotate(
    solid: ShapeId,
    axisOrigin: Vec3,
    axisDirection: Vec3,
    angleRadians: number,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('rotate', [solid, axisOrigin, axisDirection, angleRadians]);
  }

  // Forward all options; the kernel's own tests do not go through the worker, so a dropped option
  // (such as `merge`) would only show in the app.
  fuse(
    a: ShapeId,
    b: ShapeId,
    options?: { merge?: boolean },
  ): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('fuse', options === undefined ? [a, b] : [a, b, options]);
  }

  partition(
    solid: ShapeId,
    faces: readonly ShapeId[],
  ): Promise<KernelResult<{ selected: ShapeId; remainder: ShapeId | null }>> {
    return this.#call('partition', [solid, faces]);
  }

  partitionByHashes(
    solid: ShapeId,
    faces: readonly FaceHash[],
  ): Promise<KernelResult<{ selected: ShapeId; remainder: ShapeId | null }>> {
    return this.#call('partitionByHashes', [solid, faces]);
  }
  solidFaceGroups(
    solid: ShapeId,
  ): Promise<KernelResult<readonly (readonly import('../types.js').FaceHash[])[]>> {
    return this.#call('solidFaceGroups', [solid]);
  }
  compound(original: ShapeId, copy: ShapeId): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('compound', [original, copy]);
  }

  combine(
    kind: 'fuse' | 'cut' | 'intersect',
    target: ShapeId,
    tool: ShapeId,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('combine', [kind, target, tool]);
  }

  duplicate(shape: ShapeId): Promise<KernelResult<ShapeId>> {
    return this.#call('duplicate', [shape]);
  }

  contact(a: ShapeId, b: ShapeId): Promise<KernelResult<'apart' | 'touching' | 'overlapping'>> {
    return this.#call('contact', [a, b]);
  }

  contactsNear(
    body: ShapeId,
    near: ShapeId,
    limit: number,
  ): Promise<
    KernelResult<readonly { face: FaceHash; contact: 'touching' | 'overlapping' }[] | null>
  > {
    return this.#call('contactsNear', [body, near, limit]);
  }

  splitByPlane(
    solid: ShapeId,
    origin: Vec3,
    normal: Vec3,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('splitByPlane', [solid, origin, normal]);
  }

  scale(
    solid: ShapeId,
    center: Vec3,
    factor: number | Vec3,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('scale', [solid, center, factor]);
  }

  mirror(solid: ShapeId, point: Vec3, normal: Vec3): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('mirror', [solid, point, normal]);
  }

  cut(target: ShapeId, tool: ShapeId): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('cut', [target, tool]);
  }

  intersect(a: ShapeId, b: ShapeId): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('intersect', [a, b]);
  }

  removeFaces(solid: ShapeId, faces: readonly ShapeId[]): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('removeFaces', [solid, faces]);
  }

  fillet(
    solid: ShapeId,
    edges: readonly ShapeId[],
    radius: number,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('fillet', [solid, edges, radius]);
  }

  chamfer(
    solid: ShapeId,
    edges: readonly ShapeId[],
    distance: number,
    other?: number,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('chamfer', [solid, edges, distance, other]);
  }

  shell(
    solid: ShapeId,
    facesToRemove: readonly ShapeId[],
    thickness: number,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('shell', [solid, facesToRemove, thickness]);
  }

  subShapes(
    shape: ShapeId,
    type: 'face' | 'edge' | 'vertex',
  ): Promise<KernelResult<readonly ShapeId[]>> {
    return this.#call('subShapes', [shape, type]);
  }

  describeFaces(shape: ShapeId): Promise<KernelResult<readonly FaceDescription[]>> {
    return this.#call('describeFaces', [shape]);
  }

  faceHashes(shape: ShapeId): Promise<KernelResult<readonly FaceHash[]>> {
    return this.#call('faceHashes', [shape]);
  }

  massProperties(shape: ShapeId): Promise<KernelResult<import('../kernel.js').MassProperties>> {
    return this.#call('massProperties', [shape]);
  }

  measureFaces(faces: readonly ShapeId[]): Promise<KernelResult<readonly FaceMeasurement[]>> {
    return this.#call('measureFaces', [faces]);
  }

  bounds(shape: ShapeId): Promise<KernelResult<Bounds>> {
    return this.#call('bounds', [shape]);
  }

  sharedEdge(faceA: ShapeId, faceB: ShapeId): Promise<KernelResult<ShapeId | null>> {
    return this.#call('sharedEdge', [faceA, faceB]);
  }
  sharedVertex(faces: readonly ShapeId[]): Promise<KernelResult<ShapeId | null>> {
    return this.#call('sharedVertex', [faces]);
  }
  faceCylinder(face: ShapeId): Promise<KernelResult<CylindricalFace | null>> {
    return this.#call('faceCylinder', [face]);
  }
  resizeCylinder(
    solid: ShapeId,
    face: ShapeId,
    radius: number,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('resizeCylinder', [solid, face, radius]);
  }
  moveParts(
    solid: ShapeId,
    parts: readonly ShapeId[],
    motion: PartMotion,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('moveParts', [solid, parts, motion]);
  }
  offsetFaces(
    solid: ShapeId,
    faces: readonly ShapeId[],
    distance: number,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return this.#call('offsetFaces', [solid, faces, distance]);
  }
  facePlane(face: ShapeId): Promise<KernelResult<{ origin: Vec3; normal: Vec3 }>> {
    return this.#call('facePlane', [face]);
  }

  tessellate(shape: ShapeId, options?: TessellationOptions): Promise<KernelResult<Mesh>> {
    return this.#call('tessellate', [shape, options]);
  }

  extractEdges(shape: ShapeId, options?: TessellationOptions): Promise<KernelResult<EdgeSet>> {
    return this.#call('extractEdges', [shape, options]);
  }

  tessellateSolids(
    shape: ShapeId,
    solids: readonly number[],
    options: TessellationOptions,
  ): Promise<KernelResult<Mesh>> {
    return this.#background('tessellateSolids', [shape, solids, options]);
  }

  extractSolidEdges(
    shape: ShapeId,
    solids: readonly number[],
    options: TessellationOptions,
  ): Promise<KernelResult<EdgeSet>> {
    return this.#background('extractSolidEdges', [shape, solids, options]);
  }

  splitForMeshing(shape: ShapeId, count: number): Promise<KernelResult<MeshPacket[] | null>> {
    return this.#call('splitForMeshing', [shape, count]);
  }

  meshPacket(brep: Uint8Array, options: TessellationOptions): Promise<KernelResult<MeshedPacket>> {
    return this.#call('meshPacket', [brep, options]);
  }

  adoptMeshes(
    shape: ShapeId,
    packet: { first: number; end: number } & MeshedPacket,
    options: TessellationOptions,
  ): Promise<KernelResult<boolean>> {
    return this.#call('adoptMeshes', [shape, packet, options]);
  }

  projectDrawing(
    shape: ShapeId,
    direction: import('../projection.js').DrawingDirection,
  ): Promise<KernelResult<import('../projection.js').DrawingProjection>> {
    return this.#call('projectDrawing', [shape, direction]);
  }

  exportStep(shape: ShapeId): Promise<KernelResult<string>> {
    return this.#call('exportStep', [shape]);
  }

  exportStepFile(
    shape: ShapeId,
    parts?: readonly import('../kernel.js').StepPart[],
  ): Promise<KernelResult<Uint8Array>> {
    return this.#call('exportStepFile', [shape, parts]);
  }

  sectionDrawing(
    shape: ShapeId,
    fraction: number,
  ): Promise<KernelResult<import('../projection.js').DrawingProjection>> {
    return this.#call('sectionDrawing', [shape, fraction]);
  }

  sectionByPlane(
    shape: ShapeId,
    plane: { origin: Vec3; normal: Vec3; xDirection: Vec3 },
  ): Promise<KernelResult<number[][]>> {
    return this.#call('sectionByPlane', [shape, plane]);
  }

  exportStl(shape: ShapeId, options?: TessellationOptions): Promise<KernelResult<Uint8Array>> {
    return this.#call('exportStl', [shape, options]);
  }

  importIges(data: string): Promise<KernelResult<ShapeId>> {
    return this.#call('importIges', [data], importBudgetMs(data.length));
  }

  importStep(data: string, options?: ImportOptions): Promise<KernelResult<ShapeId>> {
    return this.#call('importStep', [data, options ?? {}], importBudgetMs(data.length));
  }

  importKept(key: string): Promise<KernelResult<ShapeId | null>> {
    return this.#call('importKept', [key]);
  }

  importNames(
    key: string,
    data?: string,
  ): Promise<KernelResult<{ names: (string | null)[]; faces: number[] } | null | undefined>> {
    return this.#call('importNames', data === undefined ? [key] : [key, data]);
  }

  importColours(key: string, data?: string): Promise<KernelResult<Uint32Array | null | undefined>> {
    return this.#call('importColours', data === undefined ? [key] : [key, data]);
  }

  async dispose(shape: ShapeId): Promise<void> {
    // After a crash the shapes died with the worker, so a failure here is not reported.
    await this.#call('dispose', [shape]);
  }

  async liveShapeCount(): Promise<number> {
    const result = await this.#call<number>('liveShapeCount', []);
    return result.ok ? result.value : 0;
  }

  async flushStore(): Promise<void> {
    await this.#call('flushStore', []);
  }
}

/**
 * Time per kernel method as the page sees it, including transfer and queueing. Off unless a
 * benchmark sets `__bezierTraceKernel` (`e2e/view/perf-voron.spec.ts`).
 */
interface KernelTrace {
  __bezierTraceKernel?: boolean;
  __bezierKernelCalls?: Record<string, { calls: number; ms: number }>;
  /** Every call in order: method, when it was asked for and how long it took, in milliseconds. */
  __bezierKernelEvents?: [string, number, number][];
}

function tracing(): boolean {
  return (globalThis as KernelTrace).__bezierTraceKernel === true;
}

function traceCall(method: string, started: number, ms: number): void {
  const scope = globalThis as KernelTrace;
  const calls = scope.__bezierKernelCalls ?? {};
  scope.__bezierKernelCalls = calls;
  const entry = calls[method] ?? { calls: 0, ms: 0 };
  entry.calls += 1;
  entry.ms += ms;
  calls[method] = entry;
  const events = scope.__bezierKernelEvents ?? [];
  scope.__bezierKernelEvents = events;
  if (events.length < 10_000) events.push([method, started, ms]);
}
