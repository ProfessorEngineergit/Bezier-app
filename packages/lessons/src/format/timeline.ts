/**
 * Which stretches of the recording play, and where the chapters fall.
 *
 * Lesson time is seconds from the start of the recorded video; events, checkpoints and cuts use
 * it. Playback time is what the scrub bar shows: lesson time minus the removed stretches. All
 * conversion between the two lives here.
 */

import type { LessonManifest, LessonState } from './manifest.js';

export interface Stretch {
  start: number;
  end: number;
}

/** Times closer than this are treated as equal (float noise). */
const NEAR = 0.0005;

/**
 * The stretches that play, sorted, non-empty and non-overlapping. `cuts` are the kept pieces
 * (docs/lesson-format.md); an empty result plays the whole recording.
 */
export function keptStretches(manifest: Pick<LessonManifest, 'cuts' | 'duration'>): Stretch[] {
  const { duration } = manifest;
  const clamp = (t: number) => Math.min(Math.max(0, t), duration);
  const sorted = manifest.cuts
    .map((cut) => ({ start: clamp(cut.start), end: clamp(cut.end) }))
    .filter((cut) => cut.end - cut.start > 0.001)
    .sort((a, b) => a.start - b.start);
  const merged: Stretch[] = [];
  for (const cut of sorted) {
    const last = merged.at(-1);
    if (last !== undefined && cut.start <= last.end + 0.001) last.end = Math.max(last.end, cut.end);
    else merged.push({ ...cut });
  }
  return merged.length > 0 ? merged : [{ start: 0, end: duration }];
}

/** The stretches left out, in order. */
export function removedStretches(manifest: Pick<LessonManifest, 'cuts' | 'duration'>): Stretch[] {
  const removed: Stretch[] = [];
  let at = 0;
  for (const kept of keptStretches(manifest)) {
    if (kept.start - at > 0.001) removed.push({ start: at, end: kept.start });
    at = kept.end;
  }
  if (manifest.duration - at > 0.001) removed.push({ start: at, end: manifest.duration });
  return removed;
}

export const playableDuration = (kept: readonly Stretch[]): number =>
  kept.reduce((sum, stretch) => sum + (stretch.end - stretch.start), 0);

/** Lesson time to playback time. Inside a removed stretch, returns where playback resumes. */
export function toPlayback(kept: readonly Stretch[], lessonTime: number): number {
  let before = 0;
  for (const stretch of kept) {
    if (lessonTime < stretch.start) return before;
    if (lessonTime <= stretch.end) return before + (lessonTime - stretch.start);
    before += stretch.end - stretch.start;
  }
  return before;
}

/** Playback time to lesson time. */
export function toLesson(kept: readonly Stretch[], playbackTime: number): number {
  let before = 0;
  for (const stretch of kept) {
    const length = stretch.end - stretch.start;
    if (playbackTime <= before + length) return stretch.start + Math.max(0, playbackTime - before);
    before += length;
  }
  return kept.at(-1)?.end ?? 0;
}

/**
 * Where the video should be for a lesson time: the time itself inside a kept stretch, the next
 * kept stretch's start inside a removed one, or null once the lesson has ended.
 */
export function playableMoment(kept: readonly Stretch[], lessonTime: number): number | null {
  for (const stretch of kept) {
    if (lessonTime < stretch.start) return stretch.start;
    if (lessonTime < stretch.end - 0.001) return lessonTime;
  }
  return null;
}

/** A checkpoint as the timeline shows it, numbered and placed in playback time. */
export interface Chapter extends LessonState {
  /** Zero-based. */
  index: number;
  playback: number;
}

export function chapters(
  manifest: Pick<LessonManifest, 'states'>,
  kept: readonly Stretch[],
): Chapter[] {
  return manifest.states
    .map((state, order) => ({ state, order }))
    .sort((a, b) => a.state.time - b.state.time || a.order - b.order)
    .map(({ state }, index) => ({ ...state, index, playback: toPlayback(kept, state.time) }));
}

/**
 * The last chapter begun at `lessonTime`. Matching is exact because chapters can be milliseconds
 * apart; a seek to a chapter pins it (src/player/usePlayback.ts) instead of relying on the video
 * clock landing on the frame.
 */
export function chapterAt(list: readonly Chapter[], lessonTime: number): Chapter | undefined {
  let found: Chapter | undefined;
  for (const chapter of list) {
    if (chapter.time <= lessonTime + NEAR) found = chapter;
    else break;
  }
  return found ?? list[0];
}

export function nextChapter(list: readonly Chapter[], lessonTime: number): Chapter | undefined {
  return list.find((chapter) => chapter.time > lessonTime + NEAR);
}

/**
 * The previous chapter, or the start of the current one when more than two seconds in, like a
 * media player's back button.
 */
export function previousChapter(list: readonly Chapter[], lessonTime: number): Chapter | undefined {
  const current = chapterAt(list, lessonTime);
  if (current === undefined) return undefined;
  if (lessonTime > current.time + 2) return current;
  return list[current.index - 1] ?? current;
}

/** The scrub bar's segments in playback time. Chapters trimmed to zero length are left out. */
export function chapterSegments(
  list: readonly Chapter[],
  playable: number,
): { chapter: Chapter; from: number; to: number }[] {
  const segments: { chapter: Chapter; from: number; to: number }[] = [];
  list.forEach((chapter, i) => {
    const from = chapter.playback;
    const to = list[i + 1]?.playback ?? playable;
    if (to - from > 0.001 || (segments.length === 0 && i === list.length - 1)) {
      segments.push({ chapter, from, to });
    }
  });
  return segments;
}
