/**
 * Motion of a project card while it is dragged. Position is not smoothed (the card stays under the
 * pointer); the card swings from its grab point, its size springs on pick-up and drop, and fast
 * moves squash it slightly. Kept to a few degrees and percent.
 */

export interface Motion {
  /** Smoothed pointer velocity, in pixels per second. */
  vx: number;
  vy: number;
}

/** How quickly the smoothed velocity follows the measured one, per second. */
const FOLLOW = 18;
/** How quickly it falls back to rest once the pointer stops, per second. */
const REST = 9;

/**
 * Folds one pointer step (`dx`, `dy` pixels over `dt` seconds) into the smoothed velocity. Steps
 * under a millisecond apart (coalesced events) are skipped.
 */
export function track(motion: Motion, dx: number, dy: number, dt: number): void {
  if (dt < 0.001) return;
  const weight = 1 - Math.exp(-FOLLOW * Math.min(dt, 0.1));
  motion.vx += (dx / dt - motion.vx) * weight;
  motion.vy += (dy / dt - motion.vy) * weight;
}

/** Decays the velocity over `dt` seconds without a pointer step. */
export function relax(motion: Motion, dt: number): void {
  const keep = Math.exp(-REST * Math.max(0, dt));
  motion.vx *= keep;
  motion.vy *= keep;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Swing of the card about its grab point: a damped pendulum driven by the pointer's acceleration,
 * integrated per frame.
 */
export interface Swing {
  /** Radians, positive clockwise. */
  angle: number;
  /** Radians per second. */
  spin: number;
}

/** Restoring stiffness: about one and a half swings a second. */
const SWING_STIFFNESS = 90;
/** Settles within a second while still overshooting. */
const SWING_DAMPING = 8.5;
/** Push per unit of acceleration (px/s²). */
const SWING_PUSH = 0.0011;
/** Beyond this the card reads as dropped rather than held. */
const SWING_LIMIT = (14 * Math.PI) / 180;

/** Advances the swing by `dt` seconds under a horizontal acceleration of `ax` px/s². */
export function swing(state: Swing, ax: number, dt: number): void {
  // Small steps keep the spring stable through a stalled frame.
  let left = Math.min(dt, 0.1);
  while (left > 0) {
    const h = Math.min(left, 1 / 120);
    left -= h;
    state.spin +=
      (-SWING_STIFFNESS * state.angle - SWING_DAMPING * state.spin - ax * SWING_PUSH) * h;
    state.angle = clamp(state.angle + state.spin * h, -SWING_LIMIT, SWING_LIMIT);
  }
}

/** The card's size on a spring: overshoots slightly on pick-up and on drop into a folder. */
export interface Size {
  value: number;
  speed: number;
}

const SIZE_STIFFNESS = 280;
const SIZE_DAMPING = 20;

export function spring(size: Size, goal: number, dt: number): void {
  let left = Math.min(dt, 0.1);
  while (left > 0) {
    const h = Math.min(left, 1 / 120);
    left -= h;
    size.speed += (SIZE_STIFFNESS * (goal - size.value) - SIZE_DAMPING * size.speed) * h;
    size.value += size.speed * h;
  }
}

export interface Pose {
  /** Scale along each axis. */
  sx: number;
  sy: number;
  /** Degrees of lean into the horizontal motion. */
  tilt: number;
}

/** The card's pose: rotated by the swing, squashed by speed by at most 3%. */
export function pose(motion: Motion, hang: Swing, scale: number): Pose {
  const sideways = clamp(Math.abs(motion.vx) / 1800, 0, 1);
  const upright = clamp(Math.abs(motion.vy) / 1800, 0, 1);
  return {
    sx: scale * (1 + 0.03 * sideways - 0.02 * upright),
    sy: scale * (1 - 0.02 * sideways + 0.03 * upright),
    tilt: (hang.angle * 180) / Math.PI,
  };
}

/**
 * The CSS transform that puts the grab point (`transform-origin`) at (`x`, `y`), rotated and scaled
 * about that point.
 */
export function transformFor(x: number, y: number, grabX: number, grabY: number, shape: Pose) {
  return (
    `translate3d(${(x - grabX).toFixed(1)}px, ${(y - grabY).toFixed(1)}px, 0) ` +
    `rotate(${shape.tilt.toFixed(2)}deg) scale(${shape.sx.toFixed(4)}, ${shape.sy.toFixed(4)})`
  );
}
