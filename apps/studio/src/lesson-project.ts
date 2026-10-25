/**
 * A lesson's project: the model built while following a lesson, stored with its place in the
 * lesson. Shown on the Learn page, not among projects; opening it resumes the lesson. "Save as
 * Project" copies it to an ordinary project.
 */

import type { CadDocument } from '@bezier/core';

/** What `saveAsProject` needs of the store. */
export interface LessonProjectStore {
  load(id: string): Promise<{ document: CadDocument }>;
  importProject(id: string, document: CadDocument): Promise<void>;
  readThumbnail(id: string): Promise<Uint8Array | null>;
  saveThumbnail(id: string, image: Uint8Array): Promise<void>;
}

export function isLessonProject(id: string): boolean {
  return id.startsWith('lesson-');
}

/**
 * Copies a lesson's project to an ordinary one and returns the copy's id. The original stays, so
 * the lesson can still be resumed.
 */
export async function saveAsProject(store: LessonProjectStore, id: string): Promise<string> {
  const { document } = await store.load(id);
  const copy = `doc-${Date.now()}`;
  await store.importProject(copy, document);
  // Optional: without a picture the card shows an empty floor until opened.
  try {
    const image = await store.readThumbnail(id);
    if (image !== null) await store.saveThumbnail(copy, image);
  } catch {
    // The project itself was copied.
  }
  return copy;
}

export interface LessonProject {
  lesson: string;
  at: number;
}

export function readLessonProject(text: string | null): LessonProject | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== 'object') return null;
    const { lesson, at } = value as Partial<LessonProject>;
    return typeof lesson === 'string' &&
      lesson.length > 0 &&
      typeof at === 'number' &&
      Number.isFinite(at) &&
      at >= 0
      ? { lesson, at }
      : null;
  } catch {
    return null;
  }
}
