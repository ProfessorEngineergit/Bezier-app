/**
 * Every edit an author can make to a lesson, as pure functions of the manifest. The edit view
 * calls these; nothing else writes a manifest.
 */

import type { AvatarCorner, LessonLevel, LessonManifest, LessonState } from './manifest.js';
import { chapterAt, chapters, keptStretches, type Stretch } from './timeline.js';

export interface LessonDetails {
  title: string;
  description: string;
  level: LessonLevel | undefined;
}

export function setDetails(manifest: LessonManifest, details: Partial<LessonDetails>) {
  const next: LessonManifest = { ...manifest };
  if (details.title !== undefined) next.title = details.title;
  if (details.description !== undefined) next.description = details.description;
  if ('level' in details) {
    if (details.level === undefined) delete next.level;
    else next.level = details.level;
  }
  return next;
}

export const setCompleted = (manifest: LessonManifest, completed: boolean): LessonManifest => ({
  ...manifest,
  completed,
});

const byTime = (a: { time: number }, b: { time: number }) => a.time - b.time;

export function renameChapter(manifest: LessonManifest, index: number, title: string) {
  const states = chapters(manifest, keptStretches(manifest)).map(
    ({ time, title: was, project }, i): LessonState => ({
      time,
      title: i === index ? title : was,
      project,
    }),
  );
  return { ...manifest, states };
}

/** The first chapter is the model the lesson starts from; it stays. */
export function canRemoveChapter(manifest: LessonManifest, index: number): boolean {
  return index > 0 && index < manifest.states.length;
}

export function removeChapter(manifest: LessonManifest, index: number): LessonManifest {
  if (!canRemoveChapter(manifest, index)) return manifest;
  const states = chapters(manifest, keptStretches(manifest))
    .filter((chapter) => chapter.index !== index)
    .map(({ time, title, project }): LessonState => ({ time, title, project }));
  return { ...manifest, states };
}

/**
 * Moves a chapter to `time`. Its checkpoint model does not change. The first chapter is the start
 * and does not move.
 */
export function moveChapter(manifest: LessonManifest, index: number, time: number) {
  if (index === 0) return manifest;
  const at = Math.min(manifest.duration, Math.max(0, time));
  const states = chapters(manifest, keptStretches(manifest))
    .map(
      ({ time: was, title, project }, i): LessonState => ({
        time: i === index ? at : was,
        title,
        project,
      }),
    )
    .sort(byTime);
  return { ...manifest, states };
}

/** Adds a chapter at `time`, using the checkpoint in effect at that moment as its model. */
export function addChapterAt(manifest: LessonManifest, time: number, title: string) {
  const list = chapters(manifest, keptStretches(manifest));
  const project = chapterAt(list, time)?.project ?? '';
  const states = [...manifest.states, { time, title, project }].sort(byTime);
  return { ...manifest, states };
}

const cutsFrom = (kept: readonly Stretch[]) => kept.map(({ start, end }) => ({ start, end }));

/** Leaves a stretch out of playback. The recording itself is not changed. */
export function removeStretch(manifest: LessonManifest, start: number, end: number) {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(manifest.duration, Math.max(start, end));
  if (to - from < 0.001) return manifest;
  const kept: Stretch[] = [];
  for (const stretch of keptStretches(manifest)) {
    if (stretch.end <= from || stretch.start >= to) kept.push(stretch);
    else {
      if (stretch.start < from) kept.push({ start: stretch.start, end: from });
      if (stretch.end > to) kept.push({ start: to, end: stretch.end });
    }
  }
  return { ...manifest, cuts: cutsFrom(kept) };
}

/** Puts a removed stretch back. */
export function restoreStretch(manifest: LessonManifest, start: number, end: number) {
  const kept = keptStretches({
    duration: manifest.duration,
    cuts: [...manifest.cuts, { start, end }],
  });
  return { ...manifest, cuts: cutsFrom(kept) };
}

/** Places the camera picture in `corner` from `time` on. */
export function setCameraCorner(manifest: LessonManifest, time: number, corner: AvatarCorner) {
  const others = manifest.avatar.filter((cue) => Math.abs(cue.time - time) > 0.05);
  const avatar = [...others, { time, corner }].sort(byTime);
  return { ...manifest, avatar };
}

export function removeCameraCue(manifest: LessonManifest, index: number): LessonManifest {
  const avatar = manifest.avatar.filter((_, i) => i !== index);
  return { ...manifest, avatar };
}
