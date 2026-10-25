/**
 * Camera placement that makes a model fill the frame. Pure arithmetic, so it can be tested.
 *
 * Fits the box's extent in camera space rather than its bounding sphere, which is always too loose
 * (a 40 × 20 × 15 part has a sphere radius of 23.6 but is never wider than 40 on screen).
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Framing {
  position: Vec3;
  target: Vec3;
  near: number;
  far: number;
}

/** Margin around the model. Small, since the fit is already exact. */
const MARGIN = 1.08;

/** Fallback view direction when the camera has no meaningful one yet. */
const DEFAULT_DIRECTION: Vec3 = { x: 0.6, y: -0.8, z: 0.55 };

/**
 * World up is +Z (sketches on XY, extruded along Z). Three.js defaults to Y-up, so cameras must be
 * given this too, or their basis disagrees with the one measured here.
 */
const WORLD_UP: Vec3 = { x: 0, y: 0, z: 1 };

/**
 * Frames an axis-aligned box, keeping the current view direction. `direction` points from the
 * target to the camera and need not be normalised.
 */
export function frameBounds(
  min: Vec3,
  max: Vec3,
  fovDegrees: number,
  aspect: number,
  direction: Vec3 = DEFAULT_DIRECTION,
  worldUp: Vec3 = WORLD_UP,
): Framing {
  const centre = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };

  const back = normalise(direction) ?? normalise(DEFAULT_DIRECTION) ?? { x: 0, y: 0, z: 1 };

  // Must match the basis Three.js builds from `camera.up` in `lookAt`; a different one measured a
  // 3% overflow on a 16:9 viewport.
  const right = normalise(cross(worldUp, back)) ??
    normalise(cross(fallbackUp(back), back)) ?? { x: 1, y: 0, z: 0 };
  const up = cross(back, right);

  const vertical = (fovDegrees * Math.PI) / 180;
  const tanV = Math.tan(vertical / 2);
  const tanH = tanV * Math.max(aspect, 0.01);

  // Solve per corner, not per axis: each corner must fit at its own depth. Per-axis extremes plus
  // half-depth are loose (76% of a narrow viewport where the exact fit is 89%).
  let distance = 0;
  let halfDepth = 0;
  for (const corner of cornersOf(min, max)) {
    const offset = { x: corner.x - centre.x, y: corner.y - centre.y, z: corner.z - centre.z };
    const towardsCamera = dot(offset, back);
    const acrossX = Math.abs(dot(offset, right));
    const acrossY = Math.abs(dot(offset, up));

    halfDepth = Math.max(halfDepth, Math.abs(towardsCamera));
    distance = Math.max(
      distance,
      (acrossY / tanV) * MARGIN + towardsCamera,
      (acrossX / tanH) * MARGIN + towardsCamera,
    );
  }

  const safe = distance > 0 ? distance : 1;

  return {
    target: centre,
    position: {
      x: centre.x + back.x * safe,
      y: centre.y + back.y * safe,
      z: centre.z + back.z * safe,
    },
    // Generous margins: a tight near plane causes z-fighting on coplanar faces.
    near: Math.max(safe / 1000, 0.01),
    far: (safe + halfDepth) * 10,
  };
}

/** The eight corners of an axis-aligned box. */
function cornersOf(min: Vec3, max: Vec3): Vec3[] {
  const corners: Vec3[] = [];
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) corners.push({ x, y, z });
    }
  }
  return corners;
}

/**
 * An up vector for the case where the camera looks straight along the real one: a plan view, where
 * "up on screen" is undefined.
 */
function fallbackUp(back: Vec3): Vec3 {
  return Math.abs(back.z) > 0.9 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalise(v: Vec3): Vec3 | null {
  const length = Math.hypot(v.x, v.y, v.z);
  return length === 0 ? null : { x: v.x / length, y: v.y / length, z: v.z / length };
}

/** A box with margin, for framing part of the model clear of the surrounding UI. */
export function withAir(
  bounds: { min: readonly number[]; max: readonly number[] },
  fraction = 0.14,
): { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } {
  const [x0 = 0, y0 = 0, z0 = 0] = bounds.min;
  const [x1 = 0, y1 = 0, z1 = 0] = bounds.max;
  const air = Math.hypot(x1 - x0, y1 - y0, z1 - z0) * fraction;
  return {
    min: { x: x0 - air, y: y0 - air, z: z0 - air },
    max: { x: x1 + air, y: y1 + air, z: z1 + air },
  };
}
