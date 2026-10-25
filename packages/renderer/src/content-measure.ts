/**
 * Centre and extent of the model, measured from the scene's `content` only (no grid or helpers).
 */

import { Box3, type Object3D, Vector3 } from 'three';

const box = new Box3();
const point = new Vector3();

/**
 * Centre of the model in world millimetres, or null when nothing is built. Used by the move gizmo.
 */
export function contentCenter(content: Object3D): { x: number; y: number; z: number } | null {
  box.makeEmpty();
  box.expandByObject(content);
  if (box.isEmpty()) return null;
  box.getCenter(point);
  return { x: point.x, y: point.y, z: point.z };
}

/**
 * Half the model's bounding diagonal, for zoom (`navigation.ts`). Measured at most twice a second,
 * since a fast wheel asks many times.
 */
export class ContentReach {
  #value: number | null = null;
  #at = -Infinity;

  constructor(private readonly content: Object3D) {}

  get(): number | null {
    const now = performance.now();
    if (now - this.#at < 500) return this.#value;
    box.makeEmpty();
    box.expandByObject(this.content);
    this.#value = box.isEmpty() ? null : box.getSize(point).length() / 2;
    this.#at = now;
    return this.#value;
  }
}
