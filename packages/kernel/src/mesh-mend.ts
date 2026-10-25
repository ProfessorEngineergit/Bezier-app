/**
 * Repairs faces OCCT's mesher silently skips: it reports success with no triangles for some faces
 * (172 of the Voron's 1,715 solids lacked one to four). They are mostly cones with a degenerate
 * edge, plus a few planes, and fail only at a fine angular deflection (0.5); at 0.7 the same face
 * meshes in 20 to 36 triangles. So a coarser angle is retried, for the missing faces only.
 * Zero-area sliver faces are skipped.
 */

import type { Piece } from './tessellation.js';
import type { TessellationOptions } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;

/** Less than this and a face has no area worth showing: a sliver, not a surface. */
const SLIVER_AREA = 1e-3;

/** Below this share of a face's area a face counts as not meshed. */
const HALF = 0.5;

/** A mesh covering this much of the face's area is taken as the face. */
const ENOUGH = 0.85;

/**
 * Settings to try for a skipped face, finest first: the angle is loosened first (the failure
 * depends on it), then the chord.
 */
function attempts(options: TessellationOptions): TessellationOptions[] {
  const { linearDeflection: lin } = options;
  return [
    { linearDeflection: lin, angularDeflection: 0.7 },
    { linearDeflection: lin, angularDeflection: 1 },
    { linearDeflection: lin, angularDeflection: 1.5 },
    { linearDeflection: lin, angularDeflection: 2.5 },
    { linearDeflection: lin * 5, angularDeflection: 1.5 },
    { linearDeflection: lin * 25, angularDeflection: 2.5 },
  ];
}

interface Patch {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  hash: number;
}

function areaOf(positions: Float32Array, indices: Uint32Array): number {
  let total = 0;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = (indices[t] ?? 0) * 3;
    const b = (indices[t + 1] ?? 0) * 3;
    const c = (indices[t + 2] ?? 0) * 3;
    const ux = (positions[b] ?? 0) - (positions[a] ?? 0);
    const uy = (positions[b + 1] ?? 0) - (positions[a + 1] ?? 0);
    const uz = (positions[b + 2] ?? 0) - (positions[a + 2] ?? 0);
    const vx = (positions[c] ?? 0) - (positions[a] ?? 0);
    const vy = (positions[c + 1] ?? 0) - (positions[a + 1] ?? 0);
    const vz = (positions[c + 2] ?? 0) - (positions[a + 2] ?? 0);
    total += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  return total;
}

/** One face meshed on a copy, at each setting in turn, until the triangles cover the face. */
function meshFace(
  occt: RawKernel,
  face: ReturnType<RawKernel['makeBox']>,
  hash: number,
  options: TessellationOptions,
): Patch | null {
  const area = occt.getSurfaceArea(face);
  if (!(Math.abs(area) > SLIVER_AREA)) return null;
  let best: { patch: Patch; covered: number } | null = null;
  for (const setting of attempts(options)) {
    // On a copy, so no stray triangulation is left on the shape.
    const copy = occt.copy(face);
    const mesh = occt.meshShape(copy, setting);
    occt.release(copy);
    if (mesh.indices.length === 0) continue;
    const covered = areaOf(mesh.positions, mesh.indices) / Math.abs(area);
    const patch = { positions: mesh.positions, normals: mesh.normals, indices: mesh.indices, hash };
    if (best === null || covered > best.covered) best = { patch, covered };
    if (covered >= ENOUGH) break;
  }
  return best === null || best.covered < 0.3 ? null : best.patch;
}

/**
 * `piece` with its missing faces added one by one. They may meet neighbours with a hairline crack
 * where edges were discretised differently.
 */
function mendMissingFaces(
  occt: RawKernel,
  solid: ReturnType<RawKernel['makeBox']>,
  piece: Piece,
  options: TessellationOptions,
  hashes: () => number[],
): Piece {
  const wanted = hashes();
  const handles = occt.getSubShapes(solid, 'face');
  const patches: Patch[] = [];
  try {
    for (const index of missingFaces(occt, solid, piece, hashes)) {
      const handle = handles[index];
      if (handle === undefined) continue;
      const patch = meshFace(occt, handle, (wanted[index] ?? 0) >>> 0, options);
      if (patch !== null) patches.push(patch);
    }
  } finally {
    for (const handle of handles) occt.release(handle);
  }
  if (patches.length === 0) return piece;

  let floats = piece.positions.length;
  let indexCount = piece.indices.length;
  for (const patch of patches) {
    floats += patch.positions.length;
    indexCount += patch.indices.length;
  }
  const positions = new Float32Array(floats);
  const normals = new Float32Array(floats);
  const indices = new Uint32Array(indexCount);
  const runs = new Uint32Array(piece.runs.length + patches.length * 3);
  positions.set(piece.positions);
  normals.set(piece.normals);
  indices.set(piece.indices);
  runs.set(piece.runs);
  let floatAt = piece.positions.length;
  let indexAt = piece.indices.length;
  let runAt = piece.runs.length;
  for (const patch of patches) {
    positions.set(patch.positions, floatAt);
    normals.set(patch.normals, floatAt);
    const firstVertex = floatAt / 3;
    for (let i = 0; i < patch.indices.length; i++) {
      indices[indexAt + i] = (patch.indices[i] ?? 0) + firstVertex;
    }
    runs[runAt] = indexAt / 3;
    runs[runAt + 1] = patch.indices.length / 3;
    runs[runAt + 2] = patch.hash;
    floatAt += patch.positions.length;
    indexAt += patch.indices.length;
    runAt += 3;
  }
  return { positions, normals, indices, runs };
}

/** Each face's meshed area, by the face's hash. */
function coverage(piece: Piece): Map<number, number> {
  const covered = new Map<number, number>();
  for (let r = 0; r + 2 < piece.runs.length; r += 3) {
    const first = (piece.runs[r] ?? 0) * 3;
    const count = (piece.runs[r + 1] ?? 0) * 3;
    const hash = (piece.runs[r + 2] ?? 0) >>> 0;
    covered.set(hash, areaOf(piece.positions, piece.indices.subarray(first, first + count)));
  }
  return covered;
}

/**
 * Indices of faces whose triangles cover less than half their area, including faces given a single
 * zero-area triangle (some cones), which a face-group count misses. Slivers are skipped.
 */
function missingFaces(
  occt: RawKernel,
  solid: ReturnType<RawKernel['makeBox']>,
  piece: Piece,
  hashes: () => number[],
): number[] {
  const covered = coverage(piece);
  const wanted = hashes();
  const handles = occt.getSubShapes(solid, 'face');
  const lacking: number[] = [];
  try {
    handles.forEach((handle, index) => {
      const area = Math.abs(occt.getSurfaceArea(handle));
      if (area <= SLIVER_AREA) return;
      if ((covered.get((wanted[index] ?? 0) >>> 0) ?? 0) < area * HALF) lacking.push(index);
    });
  } finally {
    for (const handle of handles) occt.release(handle);
  }
  return lacking;
}

/**
 * `piece` with every face that has area meshed, as far as possible. Only solids with fewer face
 * groups than faces are checked. The whole solid is remeshed with a looser angle first, so shared
 * edges agree; only if that fails are faces meshed alone and added.
 */
export function completePiece(
  occt: RawKernel,
  solid: ReturnType<RawKernel['makeBox']>,
  piece: Piece,
  options: TessellationOptions,
  remesh: (setting: TessellationOptions) => Piece,
  hashes: () => number[],
): Piece {
  if (piece.runs.length / 3 >= occt.subShapeCount(solid, 'face')) return piece;
  let lacking = missingFaces(occt, solid, piece, hashes);
  if (lacking.length === 0) return piece;
  let best = piece;
  for (const setting of attempts(options).slice(0, 4)) {
    const again = remesh(setting);
    const still = missingFaces(occt, solid, again, hashes);
    // No progress at this angle means none at looser ones either.
    if (still.length >= lacking.length) break;
    best = again;
    lacking = still;
    if (lacking.length === 0) return best;
  }
  return mendMissingFaces(occt, solid, best, options, hashes);
}
