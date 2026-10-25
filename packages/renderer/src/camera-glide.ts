/**
 * The camera path to a squared-up view. Azimuth and elevation are interpolated separately at even
 * rates, distance by ratio, and the target linearly, so the camera never cuts through the model.
 * A great-circle slerp would leave the azimuth still until a twist at the end when ending at a
 * pole.
 */

import { Vector3 } from 'three';

/** Glide duration in milliseconds; past about a third of a second an animation becomes a delay. */
export const GLIDE_MS = 320;

export interface Glide {
  /** Unit direction from the target to the camera, at the start and the end. */
  fromDirection: Vector3;
  toDirection: Vector3;
  /** Where the turn starts, in radians about Z and down from +Z. */
  fromAzimuth: number;
  fromPolar: number;
  /** How far it turns: the shorter way round in azimuth. */
  azimuthTurn: number;
  polarTurn: number;
  fromDistance: number;
  toDistance: number;
  fromTarget: Vector3;
  toTarget: Vector3;
  /** Whether to arrive in a parallel projection, morphed continuously during the flight. */
  parallel: boolean;
  startParallel?: boolean;
  startedAt: number;
}

/** Reused by every glide frame, so a camera move allocates nothing per frame. */
const glideDirection = new Vector3();

/** Below this, a direction is on the pole and its azimuth means nothing. */
const POLE = 1e-6;

function polarOf(direction: Vector3): number {
  return Math.acos(Math.min(1, Math.max(-1, direction.z)));
}

function azimuthOf(direction: Vector3): number | null {
  return Math.hypot(direction.x, direction.y) < POLE ? null : Math.atan2(direction.y, direction.x);
}

/**
 * Plans the glide between two poses. `'degenerate'` is a pose with zero distance to the target;
 * `'still'` a move that goes nowhere. Neither should start a glide.
 */
export function planGlide(
  from: { position: Vector3; target: Vector3; zoom: number },
  to: { position: Vector3; target: Vector3 },
  parallel: boolean,
  now: number,
  projectionChanges = false,
): Glide | 'degenerate' | 'still' {
  const toTarget = to.target.clone();
  const toOffset = to.position.clone().sub(toTarget);
  // A parallel start is converted to a distance: its zoom divides the offset.
  const fromOffset = from.position
    .clone()
    .sub(from.target)
    .divideScalar(from.zoom > 0 ? from.zoom : 1);
  const fromDistance = fromOffset.length();
  const toDistance = toOffset.length();
  if (fromDistance === 0 || toDistance === 0) return 'degenerate';
  const fromDirection = fromOffset.clone().divideScalar(fromDistance);
  const toDirection = toOffset.clone().divideScalar(toDistance);
  if (
    !projectionChanges &&
    fromDirection.distanceToSquared(toDirection) < 1e-10 &&
    from.target.distanceToSquared(toTarget) < 1e-10 &&
    Math.abs(fromDistance - toDistance) < 1e-6
  ) {
    return 'still';
  }
  // On a pole the azimuth is undefined; use the other end's, so the move is a pure tilt.
  const fromAzimuth = azimuthOf(fromDirection) ?? azimuthOf(toDirection) ?? 0;
  const toAzimuth = azimuthOf(toDirection) ?? fromAzimuth;
  let azimuthTurn = toAzimuth - fromAzimuth;
  azimuthTurn = Math.atan2(Math.sin(azimuthTurn), Math.cos(azimuthTurn));
  // Opposite sides have no shorter way round; go anticlockwise seen from above.
  if (Math.abs(Math.abs(azimuthTurn) - Math.PI) < 1e-9) azimuthTurn = Math.PI;
  const fromPolar = polarOf(fromDirection);
  return {
    fromDirection,
    toDirection,
    fromAzimuth,
    fromPolar,
    azimuthTurn,
    polarTurn: polarOf(toDirection) - fromPolar,
    fromDistance,
    toDistance,
    fromTarget: from.target.clone(),
    toTarget,
    parallel,
    startedAt: now,
  };
}

/**
 * Writes the pose for time `now` into `target` and `position`; true on arrival. Arrival uses the
 * recorded end pose exactly, not the last interpolated step.
 */
export function glidePose(glide: Glide, now: number, target: Vector3, position: Vector3): boolean {
  const t = Math.min(1, (now - glide.startedAt) / GLIDE_MS);
  if (t >= 1) {
    target.copy(glide.toTarget);
    position.copy(glide.toTarget).addScaledVector(glide.toDirection, glide.toDistance);
    return true;
  }
  // Ease out: responds at once and settles softly.
  const eased = 1 - (1 - t) ** 3;
  const azimuth = glide.fromAzimuth + glide.azimuthTurn * eased;
  const polar = glide.fromPolar + glide.polarTurn * eased;
  const ring = Math.sin(polar);
  glideDirection.set(ring * Math.cos(azimuth), ring * Math.sin(azimuth), Math.cos(polar));
  // Distance by ratio, not by difference, so a big change in zoom feels even.
  const distance = glide.fromDistance * (glide.toDistance / glide.fromDistance) ** eased;
  target.lerpVectors(glide.fromTarget, glide.toTarget, eased);
  position.copy(target).addScaledVector(glideDirection, distance);
  return false;
}
