/**
 * Timeline snapping: a dragged edge or flag snaps to the playhead, a chapter, a clip edge or an
 * In/Out point. The distance is in pixels, so snapping feels the same at every zoom level.
 */

/** Snap distance in screen pixels. */
export const SNAP_PIXELS = 8;

export function snapTime(
  time: number,
  targets: readonly number[],
  pixelsPerSecond: number,
  pixels = SNAP_PIXELS,
): number {
  let best = time;
  let nearest = pixels / pixelsPerSecond;
  for (const target of targets) {
    const distance = Math.abs(target - time);
    if (distance < nearest) {
      nearest = distance;
      best = target;
    }
  }
  return best;
}
