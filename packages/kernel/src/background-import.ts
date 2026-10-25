/**
 * Reads a STEP file in a separate geometry worker, so the project's worker stays free (the 241 MB
 * Voron takes about two minutes in WebKit). The helper reads and meshes the file into the shape
 * store (`shape-store.ts`, `kept-displays.ts`) and exits; the project's worker then imports it from
 * the store in seconds. Browser only: without workers it returns false.
 */

import type { GeometryKernel } from './kernel.js';
import type { Bounds, EdgeSet, MeshPiece, ShapeId, TessellationOptions } from './types.js';

export interface BackgroundImport {
  /** The file's `textKey`, taken once on the caller's side and shared. */
  key?: string;
  /** The setting to mesh at, from the number of faces the file turned out to have. */
  tessellation: (faces: number) => TessellationOptions;
  /** The outline and the space it takes, as soon as the file is read. */
  onOutline?: (outline: { edges: EdgeSet; box: Bounds }) => void;
  /** Parts of the model as they are meshed. */
  onPiece?: (piece: MeshPiece) => void;
  wasmUrl?: string;
}

/** The workers reading a file now, so that the reading can be given up on. */
const running = new Set<{ dispose(): void }>();

/** Stop reading files in the background. Each read comes back false, as for any other failure. */
export function cancelBackgroundReads(): void {
  for (const supervisor of [...running]) supervisor.dispose();
  running.clear();
}

/** True when the file was read and kept; false when it was not, for any reason. */
export async function readStepInBackground(
  text: string,
  options: BackgroundImport,
): Promise<boolean> {
  const { areWorkersAvailable, canKeepShapes, readOutlineOffThread, spawnKernelWorker } =
    await import('./worker/browser.js');
  if (!areWorkersAvailable()) return false;
  // Without a store the project's worker would read the file a second time.
  if (!(await canKeepShapes())) return false;
  // A rough outline from the text first (`step-outline.ts`), in seconds; replaced by OCCT's, and
  // dropped if OCCT's arrives first.
  let outlined = false;
  const outline = (found: { edges: EdgeSet; box: Bounds }) => {
    outlined = true;
    options.onOutline?.(found);
  };
  // Skipped for large files on small machines: the Voron outline holds 1.2 GB alongside OCCT's
  // read, risking running out of memory.
  if (!(text.length >= PACKETS_FROM_CHARACTERS && smallMachine()))
    void readOutlineOffThread(text).then((rough) => {
      if (rough !== null && !outlined) options.onOutline?.(rough);
    });
  const { WorkerSupervisor } = await import('./worker/supervisor.js');
  const { WorkerKernel } = await import('./worker/client.js');

  const supervisor = new WorkerSupervisor(() => spawnKernelWorker(options.wasmUrl), {
    ...(options.onPiece === undefined ? {} : { onPiece: options.onPiece }),
  });
  running.add(supervisor);
  const kernel = new WorkerKernel(supervisor);
  // Started now so they load while the file is read; released when done.
  const helpers = Array.from({ length: helpersFor(text.length) }, () => {
    const helper = new WorkerSupervisor(() => spawnKernelWorker(options.wasmUrl));
    running.add(helper);
    return { supervisor: helper, kernel: new WorkerKernel(helper) };
  });
  try {
    const shape = await kernel.importStep(text, {
      reuse: true,
      ...(options.key === undefined ? {} : { key: options.key }),
    });
    if (!shape.ok) return false;
    const faces = await kernel.faceHashes(shape.value);
    const setting = options.tessellation(faces.ok ? faces.value.length : 0);
    await meshInPackets(
      kernel,
      helpers.map((helper) => helper.kernel),
      shape.value,
      setting,
    );
    for (const helper of helpers) helper.supervisor.dispose();
    // Mesh first: the outline then comes off that mesh (0.3 s on the Voron) instead of a separate
    // meshing (27 s plus 22 s).
    const mesh = await kernel.tessellate(shape.value, setting);
    if (!mesh.ok) return false;
    const edges = await kernel.extractEdges(shape.value, setting);
    if (edges.ok) outline({ edges: edges.value, box: boxOf(edges.value) });
    await kernel.flushStore();
    return true;
  } catch {
    return false;
  } finally {
    // A rough outline arriving now would be drawn over the real model.
    outlined = true;
    running.delete(supervisor);
    supervisor.dispose();
    for (const helper of helpers) {
      running.delete(helper.supervisor);
      helper.supervisor.dispose();
    }
  }
}

/** Below this much text a file is meshed by the one worker: starting helpers would cost more. */
const PACKETS_FROM_CHARACTERS = 30_000_000;

/**
 * How many workers mesh beside the one that read the file: none on a machine of few cores or
 * little memory, where each would hold a share of the model and compete with the page.
 */
function helpersFor(characters: number): number {
  if (characters < PACKETS_FROM_CHARACTERS || smallMachine()) return 0;
  const cores = navigator.hardwareConcurrency ?? 2;
  return Math.max(0, Math.min(3, Math.floor(cores / 2) - 1));
}

/**
 * Four cores or fewer, or too little memory for helpers: under 16 GB where the desktop app asked the
 * system (`machine-memory.ts`; the Voron peaks above 8 GB with them), else under 8 GB where the
 * browser says (Chromium does, rounded down and never above 8; WebKit does not).
 */
function smallMachine(): boolean {
  if (typeof navigator === 'undefined') return true;
  if ((navigator.hardwareConcurrency ?? 2) <= 4) return true;
  const exact = (globalThis as { __bezierMemoryBytes?: number }).__bezierMemoryBytes;
  if (exact !== undefined) return exact < 16 * 2 ** 30;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  return memory !== undefined && memory < 8;
}

/**
 * Meshes the parts in packets across the reading worker and helpers (`mesh-parts.ts`), adopted so
 * the following `tessellate` finds them done. Anything missing is meshed there.
 */
async function meshInPackets(
  kernel: GeometryKernel,
  helpers: readonly GeometryKernel[],
  shape: ShapeId,
  setting: TessellationOptions,
): Promise<void> {
  if (helpers.length === 0) return;
  const packets = await kernel.splitForMeshing(shape, helpers.length + 1);
  if (!packets.ok || packets.value === null) return;
  await Promise.all(
    packets.value.map(async (packet, index) => {
      const meshed = await (helpers[index] ?? kernel).meshPacket(packet.brep, setting);
      if (!meshed.ok) return;
      await kernel.adoptMeshes(
        shape,
        { first: packet.first, end: packet.end, ...meshed.value },
        setting,
      );
    }),
  );
}

/** The box the outline's points span: exact extents of an unmeshed assembly cost a minute. */
function boxOf(edges: EdgeSet): Bounds {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  const points = edges.positions;
  for (let i = 0; i + 2 < points.length; i += 3) {
    const x = points[i] ?? 0;
    const y = points[i + 1] ?? 0;
    const z = points[i + 2] ?? 0;
    if (x < min.x) min.x = x;
    if (y < min.y) min.y = y;
    if (z < min.z) min.z = z;
    if (x > max.x) max.x = x;
    if (y > max.y) max.y = y;
    if (z > max.z) max.z = z;
  }
  return { min, max };
}
