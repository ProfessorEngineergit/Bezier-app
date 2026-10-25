/**
 * Image placement on its plane and the handle drag math, pure and in plane millimetres so handles
 * and tests agree. The middle is at (`x`, `y`), rotated by `rotation`; local axes are `right` and
 * `up`. Stored values describe what is shown: cropping an edge reduces `width`/`height` and moves
 * the middle so the remaining part stays in place.
 */

export interface Crop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Radians, anticlockwise on the plane. */
  rotation: number;
  crop: Crop;
}

export interface Point {
  u: number;
  v: number;
}

export type Corner = 'nw' | 'ne' | 'se' | 'sw';
export type Edge = 'n' | 'e' | 's' | 'w';

/** Minimum side of the shown image, in millimetres. */
export const MIN_SIDE = 0.5;
/** Maximum fraction of an axis that can be cropped, both sides together. */
export const MAX_CROP = 0.95;
/** Longer side of a newly imported image, in millimetres. */
export const FIRST_SIZE = 100;

export const NO_CROP: Crop = { left: 0, top: 0, right: 0, bottom: 0 };

const axes = (rotation: number) => ({
  right: { u: Math.cos(rotation), v: Math.sin(rotation) },
  up: { u: -Math.sin(rotation), v: Math.cos(rotation) },
});

/** A point in the image frame (millimetres from its middle) on the plane. */
export function toPlane(placement: Placement, local: Point): Point {
  const { right, up } = axes(placement.rotation);
  return {
    u: placement.x + right.u * local.u + up.u * local.v,
    v: placement.y + right.v * local.u + up.v * local.v,
  };
}

/** A plane point in the image frame. */
export function toLocal(placement: Placement, point: Point): Point {
  const { right, up } = axes(placement.rotation);
  const du = point.u - placement.x;
  const dv = point.v - placement.y;
  return { u: du * right.u + dv * right.v, v: du * up.u + dv * up.v };
}

const SIGNS: Record<Corner, Point> = {
  nw: { u: -1, v: 1 },
  ne: { u: 1, v: 1 },
  se: { u: 1, v: -1 },
  sw: { u: -1, v: -1 },
};

const EDGE_SIGNS: Record<Edge, Point> = {
  n: { u: 0, v: 1 },
  e: { u: 1, v: 0 },
  s: { u: 0, v: -1 },
  w: { u: -1, v: 0 },
};

export function cornerPoint(placement: Placement, corner: Corner): Point {
  const sign = SIGNS[corner];
  return toPlane(placement, {
    u: (sign.u * placement.width) / 2,
    v: (sign.v * placement.height) / 2,
  });
}

export function edgePoint(placement: Placement, edge: Edge): Point {
  const sign = EDGE_SIGNS[edge];
  return toPlane(placement, {
    u: (sign.u * placement.width) / 2,
    v: (sign.v * placement.height) / 2,
  });
}

export function move(placement: Placement, du: number, dv: number): Placement {
  return { ...placement, x: placement.x + du, y: placement.y + dv };
}

/**
 * Corner drag: the opposite corner stays fixed. With `keepShape` the aspect ratio is kept and the
 * corner follows the pointer along the diagonal.
 */
export function resizeCorner(
  placement: Placement,
  corner: Corner,
  pointer: Point,
  keepShape: boolean,
): Placement {
  const sign = SIGNS[corner];
  const anchor = toPlane(placement, {
    u: (-sign.u * placement.width) / 2,
    v: (-sign.v * placement.height) / 2,
  });
  const local = toLocal({ ...placement, x: anchor.u, y: anchor.v }, pointer);
  // Pointer distance from the anchor along the corner's direction; past the anchor it clamps at
  // the minimum size instead of flipping the image.
  let width = Math.max(MIN_SIDE, local.u * sign.u);
  let height = Math.max(MIN_SIDE, local.v * sign.v);
  if (keepShape) {
    const scale = Math.max(width / placement.width, height / placement.height);
    const least = Math.max(MIN_SIDE / placement.width, MIN_SIDE / placement.height);
    const factor = Math.max(scale, least);
    width = placement.width * factor;
    height = placement.height * factor;
  }
  const middle = toPlane(
    { ...placement, x: anchor.u, y: anchor.v },
    { u: (sign.u * width) / 2, v: (sign.v * height) / 2 },
  );
  return { ...placement, x: middle.u, y: middle.v, width, height };
}

/** Side drag: stretches along that axis only; the far side stays fixed. */
export function resizeEdge(placement: Placement, edge: Edge, pointer: Point): Placement {
  const sign = EDGE_SIGNS[edge];
  const anchor = toPlane(placement, {
    u: (-sign.u * placement.width) / 2,
    v: (-sign.v * placement.height) / 2,
  });
  const local = toLocal({ ...placement, x: anchor.u, y: anchor.v }, pointer);
  const width = sign.u === 0 ? placement.width : Math.max(MIN_SIDE, local.u * sign.u);
  const height = sign.v === 0 ? placement.height : Math.max(MIN_SIDE, local.v * sign.v);
  const middle = toPlane(
    { ...placement, x: anchor.u, y: anchor.v },
    { u: (sign.u * width) / 2, v: (sign.v * height) / 2 },
  );
  return { ...placement, x: middle.u, y: middle.v, width, height };
}

/** Plane millimetres per full image width and height at the current crop. */
function wholeSize(placement: Placement): { width: number; height: number } {
  const { left, right, top, bottom } = placement.crop;
  return {
    width: placement.width / (1 - left - right),
    height: placement.height / (1 - top - bottom),
  };
}

/**
 * Crops by dragging a side inward, or restores by dragging outward. Scale is unchanged; between
 * `MIN_SIDE` and `MAX_CROP` of an axis is cropped, never past the full image.
 */
export function cropEdge(placement: Placement, edge: Edge, pointer: Point): Placement {
  const whole = wholeSize(placement);
  const local = toLocal(placement, pointer);
  const sign = EDGE_SIGNS[edge];
  const horizontal = sign.u !== 0;
  const size = horizontal ? placement.width : placement.height;
  const perFraction = horizontal ? whole.width : whole.height;
  const side: keyof Crop = horizontal
    ? sign.u < 0
      ? 'left'
      : 'right'
    : sign.v > 0
      ? 'top'
      : 'bottom';
  const other: keyof Crop = horizontal
    ? side === 'left'
      ? 'right'
      : 'left'
    : side === 'top'
      ? 'bottom'
      : 'top';
  // Inward movement of the side, in millimetres; positive crops more.
  const reach = horizontal ? local.u * sign.u : local.v * sign.v;
  const inward = size / 2 - reach;
  const wanted = placement.crop[side] + inward / perFraction;
  const most = Math.min(MAX_CROP, 1 - placement.crop[other] - MIN_SIDE / perFraction);
  const next = Math.min(Math.max(0, wanted), Math.max(0, most));
  const moved = (next - placement.crop[side]) * perFraction;
  const changed = size - moved;
  // The middle moves by half the side's movement, towards the far side.
  const middle = toPlane(placement, {
    u: horizontal ? (-sign.u * moved) / 2 : 0,
    v: horizontal ? 0 : (-sign.v * moved) / 2,
  });
  return {
    ...placement,
    x: middle.u,
    y: middle.v,
    width: horizontal ? changed : placement.width,
    height: horizontal ? placement.height : changed,
    crop: { ...placement.crop, [side]: next },
  };
}

/** Corner crop: both adjacent sides, as `cropEdge` does it. */
export function cropCorner(placement: Placement, corner: Corner, pointer: Point): Placement {
  const sign = SIGNS[corner];
  const horizontal: Edge = sign.u < 0 ? 'w' : 'e';
  const vertical: Edge = sign.v > 0 ? 'n' : 's';
  const first = cropEdge(placement, horizontal, pointer);
  // The second side reads the result of the first, so they don't conflict over the middle.
  return cropEdge(first, vertical, pointer);
}

/** The uncropped image at the same scale and position. */
export function uncrop(placement: Placement): Placement {
  const whole = wholeSize(placement);
  const { left, right, top, bottom } = placement.crop;
  const middle = toPlane(placement, {
    u: ((right - left) * whole.width) / 2,
    v: ((top - bottom) * whole.height) / 2,
  });
  return {
    ...placement,
    x: middle.u,
    y: middle.v,
    width: whole.width,
    height: whole.height,
    crop: NO_CROP,
  };
}

/** Turn about the middle. */
export function rotateBy(placement: Placement, radians: number): Placement {
  return { ...placement, rotation: placement.rotation + radians };
}

/** A new image on a plane: longer side `FIRST_SIZE` millimetres, centred on the origin. */
export function firstPlacement(pixelWidth: number, pixelHeight: number): Placement {
  const longer = Math.max(pixelWidth, pixelHeight, 1);
  const scale = FIRST_SIZE / longer;
  return {
    x: 0,
    y: 0,
    width: Math.max(MIN_SIDE, pixelWidth * scale),
    height: Math.max(MIN_SIDE, pixelHeight * scale),
    rotation: 0,
    crop: NO_CROP,
  };
}

/** An angle in degrees, whole turns removed. */
function turnDegrees(radians: number): number {
  return (((((radians * 180) / Math.PI) % 360) + 540) % 360) - 180;
}

/** What `patchParams` writes for a placement: every number that can change. */
export function placementParams(placement: Placement): Record<string, number> {
  return {
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    rotation: turnDegrees(placement.rotation),
    cropLeft: placement.crop.left,
    cropTop: placement.crop.top,
    cropRight: placement.crop.right,
    cropBottom: placement.crop.bottom,
  };
}

const number = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** A feature's parameters as a placement; missing numbers take the default. */
export function placementOf(params: Readonly<Record<string, unknown>>): Placement {
  return {
    x: number(params.x, 0),
    y: number(params.y, 0),
    width: Math.max(MIN_SIDE, number(params.width, FIRST_SIZE)),
    height: Math.max(MIN_SIDE, number(params.height, FIRST_SIZE)),
    rotation: (number(params.rotation, 0) * Math.PI) / 180,
    crop: {
      left: number(params.cropLeft, 0),
      top: number(params.cropTop, 0),
      right: number(params.cropRight, 0),
      bottom: number(params.cropBottom, 0),
    },
  };
}
