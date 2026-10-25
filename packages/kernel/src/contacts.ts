/**
 * Finds which solids of a body touch or overlap another, in one kernel call against only the solids
 * whose boxes reach it. Querying each body separately took minutes next to a 1,715-part assembly.
 */

import type { SolidCache } from './tessellation.js';
import { MESH_HASH_UPPER_BOUND } from './tessellation.js';
import type { FaceHash } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;
type Box = ReturnType<RawKernel['getBoundingBox']>;

/**
 * Distance in mm (mm³ for a shared volume) below which two bodies count as meeting. Far below
 * modelling scale, far above boolean noise.
 */
export const CONTACT_TOLERANCE = 1e-6;

/**
 * The first face (by `facesOf`, the kernel's naming hashes) of each solid of `body` that
 * meets `target`, and how; null when more than `limit` are near enough to check. Boxes
 * of solids are kept in `boxes` between calls.
 */
export function contactsNear(
  occt: RawKernel,
  body: RawHandle,
  target: RawHandle,
  limit: number,
  boxes: SolidCache<Box>,
  facesOf: (solid: RawHandle) => readonly FaceHash[],
  alive: () => void,
): readonly { face: FaceHash; contact: 'touching' | 'overlapping' }[] | null {
  const box = occt.getBoundingBox(target, { precise: false });
  /** Solids to measure; `owned` when the box cache did not keep the handle. */
  const close: { solid: RawHandle; owned: boolean }[] = [];
  const solids = occt.getSubShapes(body, 'solid');
  for (const solid of solids) {
    const key = `${occt.hashCode(solid, MESH_HASH_UPPER_BOUND)}|box`;
    const { value: other, kept } = boxes.take(occt, solid, key, () =>
      occt.getBoundingBox(solid, { precise: false }),
    );
    const reaches =
      other.xmin <= box.xmax + CONTACT_TOLERANCE &&
      other.xmax >= box.xmin - CONTACT_TOLERANCE &&
      other.ymin <= box.ymax + CONTACT_TOLERANCE &&
      other.ymax >= box.ymin - CONTACT_TOLERANCE &&
      other.zmin <= box.zmax + CONTACT_TOLERANCE &&
      other.zmax >= box.zmin - CONTACT_TOLERANCE;
    if (reaches && !occt.isEqual(solid, target)) close.push({ solid, owned: !kept });
    else if (!kept) occt.release(solid);
    alive();
  }
  try {
    if (close.length > limit) return null;
    const found: { face: FaceHash; contact: 'touching' | 'overlapping' }[] = [];
    for (const { solid } of close) {
      alive();
      if (occt.distanceBetween(solid, target) > CONTACT_TOLERANCE) continue;
      const shared = occt.common(solid, target);
      const contact = occt.getVolume(shared) > CONTACT_TOLERANCE ? 'overlapping' : 'touching';
      occt.release(shared);
      const [first] = facesOf(solid);
      if (first !== undefined) found.push({ face: first, contact });
    }
    return found;
  } finally {
    for (const { solid, owned } of close) if (owned) occt.release(solid);
  }
}
