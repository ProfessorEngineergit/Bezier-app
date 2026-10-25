/**
 * Zooming in on the pointer. Authors add zooms in the edit view (the manifest's optional `zooms`);
 * the player pans to keep the pointer in view without following every small movement.
 */

import type { LessonManifest, ZoomCue } from './manifest.js';

export const ZOOM_SCALES = [1.25, 1.5, 2, 3];

/** Seconds to zoom in or out at either end of a stretch. */
const RAMP = 0.4;

/** The scale at `time`: 1 outside every zoom, eased in and out at the edges. */
export function zoomAt(manifest: Pick<LessonManifest, 'zooms'>, time: number): number {
  let scale = 1;
  for (const zoom of manifest.zooms ?? []) {
    if (time < zoom.start - RAMP || time > zoom.end + RAMP) continue;
    const into = Math.min(1, Math.max(0, (time - zoom.start + RAMP) / RAMP));
    const outOf = Math.min(1, Math.max(0, (zoom.end + RAMP - time) / RAMP));
    scale = Math.max(scale, 1 + (zoom.scale - 1) * ease(Math.min(into, outOf)));
  }
  return scale;
}

const ease = (t: number) => t * t * (3 - 2 * t);

export function zoomsAt(manifest: Pick<LessonManifest, 'zooms'>, time: number): number {
  return (manifest.zooms ?? []).findIndex((zoom) => time >= zoom.start && time <= zoom.end);
}

/**
 * The centre of the zoomed view in picture units (0 to 1). The view stays still while the pointer
 * is within its inner three-fifths and moves only as far as needed once it leaves. Clamped so the
 * view never extends past the picture's edge.
 */
export function focusOn(
  centre: { x: number; y: number },
  pointer: { x: number; y: number } | undefined,
  scale: number,
): { x: number; y: number } {
  const half = 0.5 / scale;
  const tether = half * 0.6;
  const one = (c: number, p: number | undefined) => {
    let next = c;
    if (p !== undefined) {
      if (p > c + tether) next = p - tether;
      else if (p < c - tether) next = p + tether;
    }
    return Math.min(1 - half, Math.max(half, next));
  };
  return { x: one(centre.x, pointer?.x), y: one(centre.y, pointer?.y) };
}

const byTime = (a: { start: number }, b: { start: number }) => a.start - b.start;

/** Adds a zoom, replacing any it overlaps. Zooms shorter than 0.2 s are ignored. */
export function addZoom(manifest: LessonManifest, cue: ZoomCue): LessonManifest {
  if (cue.end - cue.start < 0.2) return manifest;
  const others = (manifest.zooms ?? []).filter((z) => z.end <= cue.start || z.start >= cue.end);
  return { ...manifest, zooms: [...others, cue].sort(byTime) };
}

export function setZoomScale(manifest: LessonManifest, index: number, scale: number) {
  const zooms = (manifest.zooms ?? []).map((z, i) => (i === index ? { ...z, scale } : z));
  return { ...manifest, zooms };
}

export function removeZoom(manifest: LessonManifest, index: number): LessonManifest {
  const zooms = (manifest.zooms ?? []).filter((_, i) => i !== index);
  const next: LessonManifest = { ...manifest, zooms };
  if (zooms.length === 0) delete next.zooms;
  return next;
}
