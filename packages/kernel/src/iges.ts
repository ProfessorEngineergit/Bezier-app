/**
 * Turns IGES surfaces into solids. Most IGES writers export a part as its trimmed surfaces; these
 * are sewn and closed into solids, or kept as faces where they do not close.
 */
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

export function solidsFromIges(occt: RawKernel, read: RawHandle): RawHandle {
  if (occt.subShapeCount(read, 'solid') > 0 || occt.subShapeCount(read, 'face') === 0) return read;
  const faces = occt.getSubShapes(read, 'face');
  try {
    const closed = occt.sewAndSolidify(faces, 1e-3);
    if (occt.subShapeCount(closed, 'solid') > 0) {
      occt.release(read);
      return closed;
    }
    occt.release(closed);
    return read;
  } catch {
    return read;
  } finally {
    for (const face of faces) occt.release(face);
  }
}
