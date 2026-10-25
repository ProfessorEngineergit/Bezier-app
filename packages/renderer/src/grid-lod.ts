/**
 * Ground grid level of detail. Spacing is chosen once per frame from the viewing distance and
 * passed as a uniform, so all cells are equal; per-fragment spacing would make density rings slide
 * with the camera. Distance governs only the fade to the horizon.
 *
 * The cell is always a power of ten. Between decades the finer level fades rather than pops. The
 * shader draws three levels at once: the cell, ten cells and a hundred.
 */

/**
 * Approximate cell size per millimetre of camera distance, chosen so a 40 mm part at a comfortable
 * distance sits on a 1 mm grid with 10 mm majors.
 */
export const CELL_PER_DISTANCE = 0.007;

export interface GridLevel {
  /** Size of the fine cell, in millimetres. Always a power of ten. */
  cell: number;
  /**
   * Fine cell opacity, 0 to 1; drops as its lines crowd together, handing over to the next level.
   */
  blend: number;
}

/** The grid spacing for a camera this far from the plane. */
export function gridLevel(distance: number): GridLevel {
  // Clamp to 1 mm, the finest spacing worth drawing (and log10(0) is -Infinity).
  if (!Number.isFinite(distance) || distance <= 0) return { cell: 1, blend: 1 };

  const wanted = Math.log10(distance * CELL_PER_DISTANCE);
  const decade = Math.floor(wanted);
  return {
    cell: 10 ** decade,
    // Fully drawn at the start of a decade, faded out by the time they would be a pixel apart.
    blend: 1 - (wanted - decade),
  };
}

/**
 * The effective viewing distance for either projection. An orthographic camera zooms via `zoom`
 * without moving, so its distance is divided by `zoom`; otherwise the grid would freeze in square
 * views.
 */
export function apparentDistance(
  camera: { readonly zoom?: number; readonly isOrthographicCamera?: boolean },
  distance: number,
): number {
  const zoom = camera.zoom;
  if (camera.isOrthographicCamera !== true || zoom === undefined || zoom <= 0) return distance;
  return distance / zoom;
}

/** Distance at which the grid has faded out, proportional to the viewing distance. */
export function gridReach(distance: number): number {
  // Guarded against zero only: a 1 mm floor would stretch the ground far past the view up close,
  // costing fill rate and pushing out the far plane.
  return Math.max(distance, 1e-6) * 30;
}

/**
 * How far the ground must reach. `gridReach` around the target suffices looking down, but a camera
 * near the plane looking across it needs ground to the horizon, so `lateral` (the eye's in-plane
 * distance from the patch centre) is covered at the same multiple. Combined with `max`, not added,
 * to avoid fill rate when looking down.
 */
export function groundReach(apparent: number, lateral: number): number {
  return Math.max(gridReach(apparent), gridReach(lateral));
}

/**
 * Wraps a coordinate to within one `period` of the origin, in double precision, before it reaches
 * the shader. The shader's `fract(coordinate / cell)` loses precision in float32 far from the
 * origin (about 1e-3 mm at 1 km), which shows as moiré. `period` must be a multiple of every cell
 * size drawn.
 */
export function foldOntoPattern(coordinate: number, period: number): number {
  if (!Number.isFinite(coordinate) || !Number.isFinite(period) || period <= 0) return 0;
  return coordinate - Math.round(coordinate / period) * period;
}

/**
 * Which world axis the pointer is on, or null, with a tight tolerance since axes cross the whole
 * scene. Takes the projected origin and one projected point per axis, in screen pixels.
 */
export function axisUnderPointer(
  origin: { x: number; y: number } | null,
  tips: readonly ({ x: number; y: number } | null)[],
  pointer: { x: number; y: number },
  tolerance: number,
): number | null {
  if (origin === null) return null;

  let best: number | null = null;
  let bestDistance = tolerance;
  for (let axis = 0; axis < tips.length; axis++) {
    const tip = tips[axis];
    if (tip === undefined || tip === null) continue;
    const dx = tip.x - origin.x;
    const dy = tip.y - origin.y;
    const lengthSq = dx * dx + dy * dy;
    // An axis pointing at the camera projects to a dot and cannot be hovered.
    if (lengthSq < 1) continue;

    // A ray from the origin: the axis continues past the sample tip, and two axes can project onto
    // one screen line in opposite directions (Y down and Z up in a square view).
    const raw = ((pointer.x - origin.x) * dx + (pointer.y - origin.y) * dy) / lengthSq;
    const along = Math.max(0, raw);
    const nearX = origin.x + dx * along;
    const nearY = origin.y + dy * along;
    const distance = Math.hypot(pointer.x - nearX, pointer.y - nearY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = axis;
    }
  }
  return best;
}
