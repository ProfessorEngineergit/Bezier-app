/**
 * Where things already are in the project, so an import is not placed on top of them. Images avoid
 * other images; parts and meshes avoid parts and meshes. A part on top of an image is normal: that
 * is how one traces over it.
 */

import type { Bounds } from '@bezier/kernel';
import { decodeMesh } from './formats/mesh-read.js';
import { imageBasis } from './image/image-basis.js';
import { cornerPoint, placementOf } from './image/placement.js';
import type { SessionView } from './session.js';

/** Clearance between existing content and an import, in millimetres. */
export const GAP = 10;

let latest: SessionView | null = null;

/** The app reports what is on screen here; imports ask where there is room. */
export function noteView(view: SessionView | null): void {
  latest = view;
}

function grow(box: Bounds | null, x: number, y: number, z: number): Bounds {
  if (box === null) return { min: { x, y, z }, max: { x, y, z } };
  if (x < box.min.x) box.min.x = x;
  if (y < box.min.y) box.min.y = y;
  if (z < box.min.z) box.min.z = z;
  if (x > box.max.x) box.max.x = x;
  if (y > box.max.y) box.max.y = y;
  if (z > box.max.z) box.max.z = z;
  return box;
}

function ofPositions(box: Bounds | null, positions: ArrayLike<number>): Bounds | null {
  let out = box;
  for (let i = 0; i + 2 < positions.length; i += 3)
    out = grow(out, positions[i] ?? 0, positions[i + 1] ?? 0, positions[i + 2] ?? 0);
  return out;
}

/** Bounding box of a run of xyz triples, or null when empty. */
export function boundsOf(positions: ArrayLike<number>): Bounds | null {
  return ofPositions(null, positions);
}

/** Bounding box of every part and mesh, or of every image, in the current project. */
export function occupiedBy(
  kind: 'solid' | 'picture',
  view: SessionView | null = latest,
): Bounds | null {
  if (view === null) return null;
  let box: Bounds | null = null;
  if (kind === 'solid') {
    if (view.display !== null) box = ofPositions(box, view.display.mesh.positions);
    for (const feature of view.document.features) {
      if (feature.type !== 'reference-mesh' || typeof feature.params.mesh !== 'string') continue;
      box = ofPositions(box, decodeMesh(feature.params.mesh));
    }
    return box;
  }
  for (const feature of view.document.features) {
    if (feature.type !== 'reference-image') continue;
    const basis = imageBasis(feature.params);
    if (basis === null) continue;
    const placement = placementOf(feature.params);
    for (const corner of ['nw', 'ne', 'se', 'sw'] as const) {
      const at = cornerPoint(placement, corner);
      box = grow(
        box,
        basis.origin.x + basis.xDirection.x * at.u + basis.yDirection.x * at.v,
        basis.origin.y + basis.xDirection.y * at.u + basis.yDirection.y * at.v,
        basis.origin.z + basis.xDirection.z * at.u + basis.yDirection.z * at.v,
      );
    }
  }
  return box;
}

/**
 * X offset that places an import beside existing content: zero when they do not overlap, else
 * enough to leave `GAP` between them. X only, so placement is predictable.
 */
export function besideShift(occupied: Bounds | null, incoming: Bounds): number {
  if (occupied === null) return 0;
  const apart =
    incoming.min.x > occupied.max.x + GAP ||
    incoming.max.x < occupied.min.x - GAP ||
    incoming.min.y > occupied.max.y + GAP ||
    incoming.max.y < occupied.min.y - GAP ||
    incoming.min.z > occupied.max.z + GAP ||
    incoming.max.z < occupied.min.z - GAP;
  return apart ? 0 : occupied.max.x + GAP - incoming.min.x;
}
