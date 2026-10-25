/**
 * Messages that cross the worker boundary. Hand-written rather than an RPC library because:
 *   - The supervisor must see every request for timeouts, restarts and the circuit breaker
 *     (ADR 0009), which a library hides behind proxied calls.
 *   - Transferables must be explicit: a tessellated mesh is megabytes of typed arrays, and
 *     cloning it on every rebuild copies it twice (ADR 0007).
 */

import type { KernelResult } from '../errors.js';

/** Every method the worker will run, by name. Kept as a union so it cannot drift. */
export type KernelMethod =
  | 'sectionDrawing'
  | 'sectionByPlane'
  | 'projectDrawing'
  | 'extrude'
  | 'extrudeFace'
  | 'revolve'
  | 'loft'
  | 'wrapTool'
  | 'flatOutlines'
  | 'sweep'
  | 'translate'
  | 'rotate'
  | 'fuse'
  | 'compound'
  | 'combine'
  | 'duplicate'
  | 'contact'
  | 'contactsNear'
  | 'splitByPlane'
  | 'scale'
  | 'mirror'
  | 'partition'
  | 'partitionByHashes'
  | 'solidFaceGroups'
  | 'cut'
  | 'intersect'
  | 'fillet'
  | 'removeFaces'
  | 'chamfer'
  | 'shell'
  | 'subShapes'
  | 'describeFaces'
  | 'faceHashes'
  | 'measureFaces'
  | 'massProperties'
  | 'bounds'
  | 'sharedEdge'
  | 'sharedVertex'
  | 'faceCylinder'
  | 'resizeCylinder'
  | 'moveParts'
  | 'offsetFaces'
  | 'facePlane'
  | 'tessellate'
  | 'extractEdges'
  | 'tessellateSolids'
  | 'extractSolidEdges'
  | 'splitForMeshing'
  | 'meshPacket'
  | 'adoptMeshes'
  | 'exportStep'
  | 'exportStepFile'
  | 'exportStl'
  | 'importStep'
  | 'importIges'
  | 'importKept'
  | 'importColours'
  | 'importNames'
  | 'dispose'
  | 'liveShapeCount'
  | 'flushStore';

export interface CallMessage {
  kind: 'call';
  /** Correlates a reply with its request, and lets the supervisor time it out. */
  id: number;
  method: KernelMethod;
  args: readonly unknown[];
}

export interface ReadyMessage {
  kind: 'ready';
}

export interface ResultMessage {
  kind: 'result';
  id: number;
  result: KernelResult<unknown>;
}

/**
 * A failure the worker could not express as a `KernelResult`: a bug or crash, unlike a geometry
 * failure the user can act on. The supervisor handles the two differently.
 */
export interface FaultMessage {
  kind: 'fault';
  id: number;
  message: string;
}

export type ToWorker = CallMessage | { kind: 'init'; wasmUrl?: string };
export type FromWorker = ReadyMessage | ResultMessage | FaultMessage;

/**
 * Collects the transferable buffers in a value. Called on every reply so geometry is moved, not
 * copied; a missed buffer is a silent slowdown, hence one tested place instead of each call site.
 */
export function transferablesOf(value: unknown): Transferable[] {
  const found: Transferable[] = [];
  collect(value, found, new Set());
  return found;
}

function collect(value: unknown, into: Transferable[], seen: Set<object>): void {
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (ArrayBuffer.isView(value)) {
    const buffer = value.buffer;
    // A SharedArrayBuffer is shared, not transferred; moving it would be wrong.
    if (buffer instanceof ArrayBuffer && !into.includes(buffer)) into.push(buffer);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collect(item, into, seen);
    return;
  }

  for (const item of Object.values(value)) collect(item, into, seen);
}
