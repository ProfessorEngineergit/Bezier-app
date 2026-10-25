/**
 * Placement and snapping for the follow panel. It moves within the area the editor's UI leaves
 * free (`Keepout`) and snaps to the edges and centre line within a pixel distance. Positions are
 * stored as fractions of the free area, so a panel in a corner stays there when sizes change.
 */

export interface Size {
  width: number;
  height: number;
}

/** Pixels occupied by the editor at each edge of the overlay. */
export interface Keepout {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// The overlay already starts beneath the top bar, inside the editor stage.
export const KEEPOUT: Keepout = { left: 12, right: 12, top: 12, bottom: 12 };

export type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Keeps the corner opposite the pointer fixed while the panel resizes. */
export function resizeOrigin(at: Point, before: Size, after: Size, corner: ResizeCorner): Point {
  return {
    x: at.x + (corner.endsWith('left') ? before.width - after.width : 0),
    y: at.y + (corner.startsWith('top') ? before.height - after.height : 0),
  };
}

/** Snap distance in screen pixels. */
export const MAGNET_PIXELS = 16;

export interface Room {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** The allowed range for the panel's top left. A panel larger than the room sits at its start. */
export function roomFor(container: Size, panel: Size, keepout: Keepout = KEEPOUT): Room {
  const minX = keepout.left;
  const minY = keepout.top;
  return {
    minX,
    minY,
    maxX: Math.max(minX, container.width - keepout.right - panel.width),
    maxY: Math.max(minY, container.height - keepout.bottom - panel.height),
  };
}

export interface Point {
  x: number;
  y: number;
}

export const clampTo = (room: Room, at: Point): Point => ({
  x: Math.min(room.maxX, Math.max(room.minX, at.x)),
  y: Math.min(room.maxY, Math.max(room.minY, at.y)),
});

/** A position as fractions of the room: 0 is the start edge, 1 the far one. */
export function toFractions(room: Room, at: Point): Point {
  const spanX = room.maxX - room.minX;
  const spanY = room.maxY - room.minY;
  return {
    x: spanX <= 0 ? 1 : (at.x - room.minX) / spanX,
    y: spanY <= 0 ? 1 : (at.y - room.minY) / spanY,
  };
}

export function fromFractions(room: Room, fractions: Point): Point {
  return clampTo(room, {
    x: room.minX + fractions.x * (room.maxX - room.minX),
    y: room.minY + fractions.y * (room.maxY - room.minY),
  });
}

/** The edges the panel is snapped to, drawn as a glow. */
export interface Stuck {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
  centre: boolean;
}

const near = (a: number, b: number, pixels: number) => Math.abs(a - b) <= pixels;

/**
 * Clamps `at` into the room and snaps each axis to the nearest edge (horizontally also the centre)
 * within `pixels`.
 */
export function magnetise(
  room: Room,
  panel: Size,
  container: Size,
  at: Point,
  pixels: number = MAGNET_PIXELS,
  /** Extra snap heights for the panel's top, such as below the view cube. */
  rests: readonly number[] = [],
): { at: Point; stuck: Stuck } {
  const free = clampTo(room, at);
  const stuck: Stuck = { left: false, right: false, top: false, bottom: false, centre: false };
  let { x, y } = free;

  // Horizontal: the two edges, then the centre of the window.
  const middle = (container.width - panel.width) / 2;
  if (near(x, room.minX, pixels)) {
    x = room.minX;
    stuck.left = true;
  } else if (near(x, room.maxX, pixels)) {
    x = room.maxX;
    stuck.right = true;
  } else if (middle > room.minX && middle < room.maxX && near(x, middle, pixels)) {
    x = middle;
    stuck.centre = true;
  }
  if (near(y, room.minY, pixels)) {
    y = room.minY;
    stuck.top = true;
  } else if (near(y, room.maxY, pixels)) {
    y = room.maxY;
    stuck.bottom = true;
  } else {
    const rest = rests.find(
      (height) => height > room.minY && height < room.maxY && near(y, height, pixels),
    );
    if (rest !== undefined) y = rest;
  }
  return { at: { x, y }, stuck };
}

/**
 * How the panel's height follows its width: the picture keeps its aspect ratio, the chrome around
 * it keeps its size. Measured from the rendered panel.
 */
export interface PanelShape {
  /** Picture height per pixel of width. */
  ratio: number;
  /** Panel width minus picture width. */
  inset: number;
  /** Panel height minus picture height. */
  extra: number;
}

export const heightFor = (shape: PanelShape, width: number): number =>
  shape.extra + Math.max(0, width - shape.inset) * shape.ratio;

/** The largest width at which the panel fits within `height`. */
export const widthUnder = (shape: PanelShape, height: number): number =>
  shape.ratio <= 0 ? Number.POSITIVE_INFINITY : (height - shape.extra) / shape.ratio + shape.inset;

/**
 * Width limits per panel size. Small stays within a narrow range; large can grow to the space the
 * editor leaves. Controls keep their size at every width; only the picture scales.
 */
export function widthLimits(
  size: 'small' | 'large',
  container: Size,
  keepout: Keepout,
  shape: PanelShape | null,
): { least: number; most: number } {
  const roomWide = container.width - keepout.left - keepout.right;
  const roomTall = container.height - keepout.top - keepout.bottom;
  const fits = Math.max(
    1,
    Math.min(roomWide, shape === null ? roomWide : widthUnder(shape, roomTall)),
  );
  const [least, most] = size === 'small' ? [280, 460] : [520, 1100];
  return { least: Math.min(least, fits), most: Math.min(most, fits) };
}
