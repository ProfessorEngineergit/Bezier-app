/** Screen-space helpers for the move gizmo's allocation-free camera loop. */

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface ScreenDir {
  x: number;
  y: number;
}

/**
 * How far past a body plane the camera must go before a handle switches sides, as a fraction of the
 * viewing distance. A fixed 1e-4 mm is effectively zero, so handles flipped back and forth as the
 * damped controller settled; 3% is well above that noise and well below a deliberate orbit.
 * Proportional because nearness to a plane is relative to viewing distance.
 */
const FLIP_HYSTERESIS = 0.03;

/**
 * Keeps each axis handle on the half-axis nearest the camera, so handles never hide behind the
 * part. Uses hysteresis: a handle keeps its side until the camera is decisively past the plane, so
 * settling and small orbits leave it alone.
 */
export function updateCameraFacingSigns(
  camera: Readonly<Point3>,
  centre: Readonly<Point3>,
  signs: number[],
): void {
  const offsets = [camera.x - centre.x, camera.y - centre.y, camera.z - centre.z];
  const distance = Math.hypot(offsets[0] ?? 0, offsets[1] ?? 0, offsets[2] ?? 0);
  // A camera exactly at the centre has no side; keep the current signs.
  if (distance < 1e-6) return;
  const threshold = distance * FLIP_HYSTERESIS;

  for (let axis = 0; axis < 3; axis++) {
    const offset = offsets[axis] ?? 0;
    const wanted = offset < 0 ? -1 : 1;
    // Already on that side, or not far enough past the plane.
    if (signs[axis] === wanted || Math.abs(offset) <= threshold) continue;
    signs[axis] = wanted;
  }
}

/** A unit vector, or rightward for a zero vector. */
export function normalise(x: number, y: number): ScreenDir {
  const length = Math.hypot(x, y);
  return length < 1e-6 ? { x: 1, y: 0 } : { x: x / length, y: y / length };
}
