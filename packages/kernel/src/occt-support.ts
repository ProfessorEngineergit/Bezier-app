/**
 * Stateless helpers for `occt-kernel.ts` (split out for the size limit in
 * docs/contributing/conventions.md), testable without loading the 21 MB WebAssembly module.
 */

import type { KernelErrorCode, KernelResult } from './errors.js';
import { err, ok } from './errors.js';
import type { EvolutionData, FaceEvolution, FaceHash, Vec3 } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;

/** Maps an occt-wasm failure to a `KernelErrorCode` the UI can explain. */
export function classify(error: unknown, fallback: KernelErrorCode): KernelErrorCode {
  const code = (error as { code?: unknown } | null)?.code;
  switch (code) {
    case 'BOOLEAN_FAILED':
      return 'boolean-failed';
    case 'TESSELLATION_FAILED':
    case 'INVALID_SHAPE_ID':
      return 'invalid-result';
    case 'IMPORT_EXPORT_FAILED':
      return 'io-failed';
    default:
      return fallback;
  }
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A failure already worded for the user, with the library's text as detail; `attempt` shows this
 * message instead of its generic one.
 */
export class Refused extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}

/**
 * Runs a kernel call, converting anything thrown into a typed failure. `message` is for the user;
 * `detail` carries the raw OCCT text for bug reports and never reaches the UI.
 */
export function attempt<T>(
  fallback: KernelErrorCode,
  message: string,
  operation: () => T,
): KernelResult<T> {
  try {
    return ok(operation());
  } catch (error) {
    if (error instanceof Refused) return err(fallback, error.message, error.detail);
    return err(classify(error, fallback), message, detailOf(error));
  }
}

/**
 * Decodes occt-wasm's flat evolution data: `[inputHash, count, ...newHashes]` repeated, not the
 * plain hash list its documentation describes (checked against 3.8.3).
 */
export function decodeEvolutionTriples(flat: readonly number[]): FaceEvolution[] {
  const entries: FaceEvolution[] = [];
  let i = 0;
  while (i + 1 < flat.length) {
    const from = flat[i] as FaceHash;
    const count = flat[i + 1] ?? 0;
    entries.push({ from, to: flat.slice(i + 2, i + 2 + count) as FaceHash[] });
    i += 2 + count;
  }
  return entries;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Maps 2D sketch-plane coordinates to world space. Only the kernel knows how a plane maps to
 * world coordinates.
 */
export function toWorld(
  point: { x: number; y: number },
  origin: Vec3,
  xDirection: Vec3,
  yDirection: Vec3,
): Vec3 {
  return {
    x: origin.x + xDirection.x * point.x + yDirection.x * point.y,
    y: origin.y + xDirection.y * point.x + yDirection.y * point.y,
    z: origin.z + xDirection.z * point.x + yDirection.z * point.y,
  };
}

/**
 * The plane of a planar face, normal pointing out of the solid. `surfaceNormal` includes the face's
 * orientation (tools/spikes/face-normal-orientation.ts), so a sketch on a face extrudes outward.
 */
export function planeOfFace(
  occt: RawKernel,
  face: ReturnType<RawKernel['makeBox']>,
): { origin: Vec3; normal: Vec3 } {
  if (occt.surfaceType(face) !== 'plane') throw new Error('The face is not planar.');
  const { x, y, z } = occt.surfaceNormal(face, 0, 0);
  const length = Math.hypot(x, y, z);
  if (length < 1e-12) throw new Error('The face has no usable normal.');
  return {
    origin: occt.getSurfaceCenterOfMass(face),
    normal: { x: x / length, y: y / length, z: z / length },
  };
}

type RawHandle = ReturnType<RawKernel['makeBox']>;

/**
 * The single vertex shared by all `faces`, or null when there are zero or several; a corner named
 * by its faces must not be guessed (ADR 0001). The caller owns the returned handle.
 */
export function vertexWhereFacesMeet(
  kernel: RawKernel,
  faces: readonly RawHandle[],
): RawHandle | null {
  const [first, ...rest] = faces;
  if (first === undefined) return null;
  const candidates = kernel.getSubShapes(first, 'vertex');
  const others = rest.map((face) => kernel.getSubShapes(face, 'vertex'));
  const shared = candidates.filter((v) =>
    others.every((list) => list.some((w) => kernel.isSame(v, w))),
  );
  // A vertex is listed once per edge it ends; the same one twice is still one corner.
  const distinct = shared.filter((v, i) => shared.findIndex((w) => kernel.isSame(v, w)) === i);
  const kept = distinct.length === 1 ? (distinct[0] ?? null) : null;
  for (const v of [...candidates, ...others.flat()]) if (v !== kept) kernel.release(v);
  return kept;
}

/**
 * How a body's faces fared across the two halves a plane cut it into: kept if kept on either side,
 * a face the plane crossed modified into one piece per side, deleted only if gone from both.
 */
export function bothSides(outside: EvolutionData, inside: EvolutionData): EvolutionData {
  const kept = new Set([...outside.unchanged, ...inside.unchanged]);
  const modified = new Map<FaceHash, FaceHash[]>();
  for (const entry of [...outside.modified, ...inside.modified]) {
    modified.set(entry.from, [...(modified.get(entry.from) ?? []), ...entry.to]);
  }
  return {
    unchanged: [...kept],
    modified: [...modified].map(([from, to]) => ({ from, to })),
    generated: [...outside.generated, ...inside.generated],
    deleted: outside.deleted.filter((hash) => inside.deleted.includes(hash) && !kept.has(hash)),
  };
}

/** Row-major 3×4: stretch by `by` along the axes, about `center`. */
export function stretchAbout(center: Vec3, by: Vec3): number[] {
  return [
    by.x,
    0,
    0,
    center.x * (1 - by.x),
    0,
    by.y,
    0,
    center.y * (1 - by.y),
    0,
    0,
    by.z,
    center.z * (1 - by.z),
  ];
}

/**
 * The history of an operation that changes every face's shape and none of their number or order (a
 * stretch, which OCCT reports without history): each face became the face at its place.
 */
export function sameFaces(before: readonly FaceHash[], after: readonly FaceHash[]): EvolutionData {
  if (before.length !== after.length) throw new Error('The faces changed in number.');
  return {
    modified: before.map((from, i) => ({ from, to: [after[i] as FaceHash] })),
    generated: [],
    deleted: [],
    unchanged: [],
  };
}

/**
 * A flat face pushed along its outward normal by `distance` (signed), as a new solid. The normal is
 * `surfaceNormal`'s, which includes a reversed face's orientation; `meshShape`'s does not (see
 * tools/spikes/face-normal-orientation.ts and ADR 0001). The caller owns the result.
 */
export function extrudedFace(
  occt: RawKernel,
  source: ReturnType<RawKernel['makeBox']>,
  distance: number,
): ReturnType<RawKernel['makeBox']> {
  if (occt.surfaceType(source) !== 'plane' || !Number.isFinite(distance) || distance === 0) {
    throw new Error('Face extrusion requires a planar face and a finite non-zero distance.');
  }
  const { x, y, z } = occt.surfaceNormal(source, 0, 0);
  const length = Math.hypot(x, y, z);
  if (length < 1e-8) throw new Error('The selected face has no usable normal.');
  return occt.extrude(
    source,
    (x * distance) / length,
    (y * distance) / length,
    (z * distance) / length,
  );
}
