/**
 * Local lessons for the community features: where downloads land and uploads come from. Uses the
 * app's lesson store (`src/store`), so downloads appear on the Learn page.
 */

import type { LessonManifest, StoredLesson } from '../../src/format/manifest.js';
import { getLesson, putLesson } from '../../src/store/lessons.js';
import { listLessons as listSummaries, rememberSummary } from '../../src/store/library.js';

export async function saveLesson(lesson: StoredLesson): Promise<void> {
  try {
    await putLesson(lesson);
    await rememberSummary(lesson.manifest, lesson.viewport.size + (lesson.camera?.size ?? 0));
  } catch (error) {
    console.error('Saving a lesson failed.', error);
    throw new Error('The lesson could not be saved. Free some space on this device and try again.');
  }
}

/** Manifests of all local lessons, newest first. */
export async function listLessons(): Promise<LessonManifest[]> {
  const summaries = await listSummaries();
  const lessons = await Promise.all(summaries.map((summary) => getLesson(summary.id)));
  return lessons.flatMap((lesson) => (lesson === null ? [] : [lesson.manifest]));
}

export async function loadLesson(id: string): Promise<StoredLesson | null> {
  return getLesson(id);
}
