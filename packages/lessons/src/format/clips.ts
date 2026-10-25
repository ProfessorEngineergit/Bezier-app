/**
 * Clips on the edit view's timeline: the manifest's `cuts`, one per kept piece of the recording.
 * Touching clips stay separate so either half of a split can still be deleted; playback
 * (`keptStretches`) runs straight through the seam.
 */

import type { LessonManifest } from './manifest.js';
import { keptStretches, type Stretch } from './timeline.js';

export interface Clip extends Stretch {
  index: number;
}

/** Minimum clip length in seconds. */
export const MIN_CLIP = 0.1;

type Cut = Pick<LessonManifest, 'cuts' | 'duration'>;

export function clips(manifest: Cut): Clip[] {
  const { duration } = manifest;
  const clamp = (t: number) => Math.min(Math.max(0, t), duration);
  const list = manifest.cuts
    .map((cut) => ({ start: clamp(cut.start), end: clamp(cut.end) }))
    .filter((cut) => cut.end - cut.start > 0.001)
    .sort((a, b) => a.start - b.start);
  const kept = list.length > 0 ? list : keptStretches(manifest);
  return kept.map((stretch, index) => ({ ...stretch, index }));
}

/** The clip containing `time`, or undefined in a gap. */
export function clipAt(list: readonly Clip[], time: number): Clip | undefined {
  return list.find((clip) => time >= clip.start && time <= clip.end);
}

/** The gaps between clips, i.e. what the author left out. */
export function gaps(list: readonly Clip[], duration: number): Stretch[] {
  const out: Stretch[] = [];
  let at = 0;
  for (const clip of list) {
    if (clip.start - at > 0.001) out.push({ start: at, end: clip.start });
    at = clip.end;
  }
  if (duration - at > 0.001) out.push({ start: at, end: duration });
  return out;
}

const withCuts = <M extends Cut>(manifest: M, list: readonly Stretch[]): M => ({
  ...manifest,
  cuts: list.map(({ start, end }) => ({ start, end })),
});

/** Splits the clip at `time`. Does nothing within `MIN_CLIP` of an edge. */
export function splitClip<M extends Cut>(manifest: M, time: number): M {
  const list = clips(manifest);
  const clip = clipAt(list, time);
  if (clip === undefined || time - clip.start < MIN_CLIP || clip.end - time < MIN_CLIP)
    return manifest;
  const next = list.flatMap((c) =>
    c.index === clip.index
      ? [
          { start: c.start, end: time },
          { start: time, end: c.end },
        ]
      : [c],
  );
  return withCuts(manifest, next);
}

/** Removes a clip from the lesson. The last remaining clip cannot be removed. */
export function deleteClip<M extends Cut>(manifest: M, index: number): M {
  const list = clips(manifest);
  if (list.length < 2 || list[index] === undefined) return manifest;
  return withCuts(
    manifest,
    list.filter((clip) => clip.index !== index),
  );
}

/**
 * Moves one edge of a clip to `time`, clamped by the neighbouring clip, the recording's ends and
 * the clip's other edge.
 */
export function trimClip<M extends Cut>(
  manifest: M,
  index: number,
  edge: 'start' | 'end',
  time: number,
): M {
  const list = clips(manifest);
  const clip = list[index];
  if (clip === undefined) return manifest;
  const low = edge === 'start' ? (list[index - 1]?.end ?? 0) : clip.start + MIN_CLIP;
  const high = edge === 'end' ? (list[index + 1]?.start ?? manifest.duration) : clip.end - MIN_CLIP;
  const at = Math.min(high, Math.max(low, time));
  if (Math.abs(at - clip[edge]) < 0.0005) return manifest;
  return withCuts(
    manifest,
    list.map((c) => (c.index === index ? { ...c, [edge]: at } : c)),
  );
}

/** Restores a gap, extending the adjacent clips or adding a new one. */
export function fillGap<M extends Cut>(manifest: M, gap: Stretch): M {
  const list: Stretch[] = [...clips(manifest), gap].sort((a, b) => a.start - b.start);
  const merged: Stretch[] = [];
  for (const piece of list) {
    const last = merged.at(-1);
    if (last !== undefined && piece.start <= last.end + 0.001)
      last.end = Math.max(last.end, piece.end);
    else merged.push({ ...piece });
  }
  return withCuts(manifest, merged);
}
