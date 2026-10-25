/**
 * Closed areas of a sketch, as drawn. Uses the core's definition (`sketchRegions` in
 * `@bezier/core`) so what the UI offers for extruding matches what the rebuild builds.
 */

import { drawnGeometry, regionAt, type SketchRegion, sketchRegions } from '@bezier/core';
import type { Sketch } from '@bezier/solver';
import type { Point2D } from './sketch-tools.js';

/** All closed areas of the sketch. */
export function sketchAreas(sketch: Sketch): readonly SketchRegion[] {
  return sketchRegions(sketch, drawnGeometry(sketch));
}

/** Whether the sketch encloses at least one area usable by a solid feature. */
export function isClosed(sketch: Sketch): boolean {
  return sketchAreas(sketch).length > 0;
}

/** The smallest area containing a plane point, or null. */
export function areaAt(sketch: Sketch, at: Point2D): SketchRegion | null {
  return regionAt(sketchAreas(sketch), { x: at.u, y: at.v });
}

/** Whether a plane point lies inside one of the drawing's closed areas. */
export function closedProfileContains(sketch: Sketch, at: Point2D): boolean {
  return areaAt(sketch, at) !== null;
}
