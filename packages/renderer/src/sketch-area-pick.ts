/** The closed sketch area under a point of the screen, nearest the eye, for `Viewport.pickSketchArea`. */
import { drawnGeometry, planeToWorld, regionAt, sketchRegions } from '@bezier/core';
import { type Camera, Vector3 } from 'three';
import type { ShownSketch, SketchAreaHit } from './viewport-api.js';

const scratch = new Vector3();

export function nearestSketchArea(
  shown: readonly ShownSketch[],
  camera: Camera,
  /** Where the screen point lands on a sketch's plane, or null when it misses the plane. */
  pointOn: (plane: ShownSketch['plane']) => { u: number; v: number } | null,
): SketchAreaHit | null {
  let best: { hit: SketchAreaHit; distance: number } | null = null;
  for (const item of shown) {
    const at = pointOn(item.plane);
    if (at === null) continue;
    const areas = sketchRegions(item.sketch, drawnGeometry(item.sketch)).filter(
      (area) => !item.used.has(area.key),
    );
    const area = regionAt(areas, { x: at.u, y: at.v });
    if (area === null) continue;
    const world = planeToWorld(item.plane, at.u, at.v);
    const distance = camera.position.distanceTo(scratch.set(world.x, world.y, world.z));
    if (best === null || distance < best.distance) {
      best = { hit: { sketch: item.id, area: area.key, at, plane: item.plane }, distance };
    }
  }
  return best?.hit ?? null;
}
