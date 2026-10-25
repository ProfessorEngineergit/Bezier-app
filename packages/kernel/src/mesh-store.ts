/**
 * Storage format for an import's display meshes, kept beside its shape. Meshing was 47 of the 51 s
 * of reopening the Voron in Node. Face hashes do not survive a session (ADR 0001) but BREP order
 * does, so faces are stored by position in their solid and mapped back to hashes on read.
 */

import { type Counted, MESH_HASH_UPPER_BOUND, type Piece } from './tessellation.js';
import type { EdgeSet, TessellationOptions } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

/**
 * Changed whenever what is written changes, so an old file is never misread. 2: meshes written
 * before the mesher's missing faces were repaired (mesh-mend.ts) lack them.
 */
const FORMAT = 'display-2';

/** Where the meshes of one kept shape at one setting are written. */
export function meshKey(shapeKey: string, options: TessellationOptions): string {
  return `${shapeKey}-${FORMAT}-mesh-${options.linearDeflection}-${options.angularDeflection}`;
}

/** Where its outlines are written. */
export function edgeKey(shapeKey: string, options: TessellationOptions): string {
  // Outlines follow the face mesh, so both settings are in the key; older curve-sampled outlines
  // keyed by linear deflection alone are not misread.
  return `${shapeKey}-${FORMAT}-edges-mesh-${options.linearDeflection}-${options.angularDeflection}`;
}

/** Arrays laid end to end, behind a header of their lengths. */
function pack(arrays: readonly (Float32Array | Uint32Array)[]): Uint8Array {
  const header = new Uint32Array(1 + arrays.length);
  header[0] = arrays.length;
  let bytes = header.byteLength;
  arrays.forEach((array, index) => {
    header[index + 1] = array.length;
    bytes += array.byteLength;
  });
  const out = new Uint8Array(bytes);
  out.set(new Uint8Array(header.buffer), 0);
  let at = header.byteLength;
  for (const array of arrays) {
    out.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), at);
    at += array.byteLength;
  }
  return out;
}

/**
 * The arrays `pack` wrote: views onto `bytes` where word-aligned (as store reads are), copies
 * otherwise. Null when the bytes do not add up.
 */
function unpack(bytes: Uint8Array): Uint8Array[] | null {
  if (bytes.byteLength < 4) return null;
  const slice = (at: number, end: number) =>
    (bytes.byteOffset + at) % 4 === 0
      ? new Uint8Array(bytes.buffer, bytes.byteOffset + at, end - at)
      : bytes.slice(at, end);
  const words = (view: Uint8Array) =>
    new Uint32Array(view.buffer, view.byteOffset, view.length / 4);
  const count = words(slice(0, 4))[0];
  if (count === undefined || 4 + count * 4 > bytes.byteLength) return null;
  const lengths = words(slice(4, 4 + count * 4));
  const out: Uint8Array[] = [];
  let at = 4 + count * 4;
  for (const length of lengths) {
    const end = at + length * 4;
    if (end > bytes.byteLength) return null;
    out.push(slice(at, end));
    at = end;
  }
  return at === bytes.byteLength ? out : null;
}

/** A view of `bytes` as words of the given kind. */
function as<T>(
  kind: new (buffer: ArrayBufferLike, offset: number, length: number) => T,
  bytes: Uint8Array,
): T {
  return new kind(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

/** The pieces of `solids`, in order, with each face as its place in its solid. */
export function encodeMeshes(
  occt: RawKernel,
  solids: readonly RawHandle[],
  pieces: readonly Counted<Piece>[],
): Uint8Array {
  const arrays: (Float32Array | Uint32Array)[] = [];
  solids.forEach((solid, index) => {
    const piece = pieces[index];
    if (piece === undefined) throw new Error('a solid has no mesh to keep');
    const place = new Map<number, number>();
    occt.subShapeHashes(solid, 'face', MESH_HASH_UPPER_BOUND).forEach((hash, at) => {
      place.set(hash >>> 0, at);
    });
    const runs = Uint32Array.from(piece.value.runs);
    for (let r = 2; r < runs.length; r += 3) runs[r] = place.get(runs[r] ?? 0) ?? 0xffffffff;
    arrays.push(
      Uint32Array.of(piece.count),
      piece.value.positions,
      piece.value.normals,
      piece.value.indices,
      runs,
    );
  });
  return pack(arrays);
}

/**
 * The pieces `encodeMeshes` wrote, named with this session's hashes of `solids`, or null
 * when they do not belong to these solids.
 */
export function decodeMeshes(
  occt: RawKernel,
  solids: readonly RawHandle[],
  bytes: Uint8Array,
): Counted<Piece>[] | null {
  const arrays = unpack(bytes);
  if (arrays === null || arrays.length !== solids.length * 5) return null;
  const out: Counted<Piece>[] = [];
  for (let s = 0; s < solids.length; s++) {
    const solid = solids[s];
    const [count, positions, normals, indices, runs] = arrays.slice(s * 5, s * 5 + 5);
    if (solid === undefined || !count || !positions || !normals || !indices || !runs) return null;
    const hashes = occt.subShapeHashes(solid, 'face', MESH_HASH_UPPER_BOUND);
    const named = as(Uint32Array, runs);
    for (let r = 2; r < named.length; r += 3) {
      const hash = hashes[named[r] ?? -1];
      // A face the solid does not have: these meshes are of some other shape.
      if (hash === undefined) return null;
      named[r] = hash >>> 0;
    }
    out.push({
      count: as(Uint32Array, count)[0] ?? 0,
      value: {
        positions: as(Float32Array, positions),
        normals: as(Float32Array, normals),
        indices: as(Uint32Array, indices),
        runs: named,
      },
    });
  }
  return out;
}

/** The outlines of `solids`, in order. They name nothing, so they keep as they are. */
export function encodeEdges(pieces: readonly Counted<EdgeSet>[]): Uint8Array {
  return pack(
    pieces.flatMap((piece) => [
      Uint32Array.of(piece.count),
      piece.value.positions,
      piece.value.polylineStarts,
    ]),
  );
}

export function decodeEdges(solidCount: number, bytes: Uint8Array): Counted<EdgeSet>[] | null {
  const arrays = unpack(bytes);
  if (arrays === null || arrays.length !== solidCount * 3) return null;
  const out: Counted<EdgeSet>[] = [];
  for (let s = 0; s < solidCount; s++) {
    const [count, positions, starts] = arrays.slice(s * 3, s * 3 + 3);
    if (!count || !positions || !starts) return null;
    out.push({
      count: as(Uint32Array, count)[0] ?? 0,
      value: {
        positions: as(Float32Array, positions),
        polylineStarts: as(Uint32Array, starts),
      },
    });
  }
  return out;
}
