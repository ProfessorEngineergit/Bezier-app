/** Projects a direction to the screen for gizmo arrows. */
import type { ViewportHandle } from './Viewport.js';

export type WorldPoint = Readonly<{ x: number; y: number; z: number }>;
export type ScreenDirection = { x: number; y: number };

/**
 * Cosine of the angle to the line of sight (about 28°) from which a direction counts as pointing at
 * or away from the eye. From here to `ALONG` (about 14°) the arrow turns to straight up or down.
 */
const TOWARD = 0.88;
const ALONG = 0.97;

/**
 * Writes into a retained vector so camera motion does not create React state.
 *
 * A direction nearly along the line of sight projects to a few pixels whose direction comes from
 * perspective, not the vector. So the closer it is to the line of sight, the more the arrow is
 * turned to straight up the screen (toward the eye).
 */
export function projectDirection(
  handle: Pick<ViewportHandle, 'project' | 'cameraPosition'>,
  anchor: WorldPoint,
  normal: WorldPoint,
  at: ScreenDirection,
  output: ScreenDirection,
): boolean {
  const length = Math.hypot(normal.x, normal.y, normal.z);
  if (length < 1e-8) return false;
  const eye = handle.cameraPosition();
  const sight = Math.hypot(eye.x - anchor.x, eye.y - anchor.y, eye.z - anchor.z);
  const facing =
    sight < 1e-8
      ? 0
      : ((eye.x - anchor.x) * normal.x +
          (eye.y - anchor.y) * normal.y +
          (eye.z - anchor.z) * normal.z) /
        (sight * length);
  const turn = smoothstep(TOWARD, ALONG, Math.abs(facing));
  const span = Math.max(sight * 0.02, 1e-4) / length;
  const tip = handle.project(
    anchor.x + normal.x * span,
    anchor.y + normal.y * span,
    anchor.z + normal.z * span,
  );
  let x = 0;
  let y = 0;
  if (tip !== null) {
    const dx = tip.x - at.x;
    const dy = tip.y - at.y;
    const screenLength = Math.hypot(dx, dy);
    if (screenLength >= 0.01) {
      x = dx / screenLength;
      y = dy / screenLength;
    } else if (turn === 0) return false;
  } else if (turn === 0) return false;
  if (turn > 0) {
    const toward = facing > 0 ? -1 : 1;
    x = x * (1 - turn);
    y = y * (1 - turn) + toward * turn;
  }
  const size = Math.hypot(x, y);
  if (size < 1e-6) return false;
  output.x = x / size;
  output.y = y / size;
  return true;
}

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}
