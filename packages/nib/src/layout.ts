/** Screen layout for Nib: his corner dock and the bubble position. Pure, for testing. */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Height for a width: the model is 3 units wide per 5 tall. */
export const heightFor = (width: number): number => (width * 5) / 3;

/** The dock corner: bottom left, clear of the rail buttons and quick settings. */
export function dockBox(viewport: Size, width: number): Box {
  const height = heightFor(width);
  return { left: 64, top: Math.max(8, viewport.height - height - 14), width, height };
}

const MARGIN = 8;
const GAP = 10;

/**
 * Bubble position: on the side with more room, level with his head, kept on screen. `side` is the
 * bubble side carrying the tail, so the tail points at him.
 */
export function bubbleBox(
  nib: Box,
  viewport: Size,
  size: Size,
): { left: number; top: number; side: 'left' | 'right' } {
  const room = { right: viewport.width - (nib.left + nib.width), left: nib.left };
  const toRight = room.right >= size.width + GAP + MARGIN || room.right >= room.left;
  const left = toRight ? nib.left + nib.width + GAP : nib.left - size.width - GAP;
  const wanted = nib.top + nib.height * 0.08;
  const top = Math.min(
    Math.max(MARGIN, wanted),
    Math.max(MARGIN, viewport.height - size.height - MARGIN),
  );
  return {
    left: Math.min(Math.max(MARGIN, left), Math.max(MARGIN, viewport.width - size.width - MARGIN)),
    top,
    side: toRight ? 'left' : 'right',
  };
}

/** A box grown on every side, since the ring is drawn outside its target. */
export function grown(box: Box, by: number): Box {
  return {
    left: box.left - by,
    top: box.top - by,
    width: box.width + 2 * by,
    height: box.height + 2 * by,
  };
}
