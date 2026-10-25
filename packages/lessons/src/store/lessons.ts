/**
 * The lesson store: IndexedDB `bezier-lessons`, store `lessons`, version 1, shared with the editor.
 * Its shape is a compatibility contract (docs/lesson-format.md). Never open it with a higher
 * version, or editor builds that open it at 1 will break.
 */

import type { LessonManifest, StoredLesson } from '../format/manifest.js';
import { type DatabaseSpec, getAll, request, transact } from './database.js';
import { isLessonRow, type LessonRow, rowFromLesson, rowToLesson } from './rows.js';

export const LESSONS_DATABASE: DatabaseSpec = {
  name: 'bezier-lessons',
  version: 1,
  stores: { lessons: { keyPath: 'id' } },
};
const STORE = 'lessons';

/** Per-lesson write queues, so concurrent writes to one lesson cannot race. */
const queues = new Map<string, Promise<unknown>>();

function queued<T>(id: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(id) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  queues.set(id, next);
  void next
    .catch(() => undefined)
    .finally(() => {
      if (queues.get(id) === next) queues.delete(id);
    });
  return next;
}

export async function lessonKeys(): Promise<string[]> {
  const keys = await transact(LESSONS_DATABASE, STORE, 'readonly', (store) =>
    request(store(STORE).getAllKeys()),
  );
  return keys.filter((key): key is string => typeof key === 'string');
}

/** The playable rows; other rows are ignored and left untouched. */
export async function allRows(): Promise<LessonRow[]> {
  const rows = await transact(LESSONS_DATABASE, STORE, 'readonly', (store) =>
    getAll<unknown>(store(STORE)),
  );
  return rows.filter(isLessonRow);
}

export async function getRow(id: string): Promise<LessonRow | null> {
  const row = await transact(LESSONS_DATABASE, STORE, 'readonly', (store) =>
    request(store(STORE).get(id)),
  );
  return isLessonRow(row) ? row : null;
}

export async function getLesson(id: string): Promise<StoredLesson | null> {
  const row = await getRow(id);
  return row === null ? null : rowToLesson(row);
}

export function putLesson(lesson: StoredLesson): Promise<void> {
  return queued(lesson.manifest.id, async () => {
    // Read the bytes before opening the transaction, or it auto-commits while `arrayBuffer()` is
    // pending.
    const row = await rowFromLesson(lesson);
    await transact(LESSONS_DATABASE, STORE, 'readwrite', (store) => request(store(STORE).put(row)));
  });
}

/** Updates the manifest of a stored lesson, keeping its media. */
export function putManifest(manifest: LessonManifest): Promise<void> {
  return queued(manifest.id, () =>
    transact(LESSONS_DATABASE, STORE, 'readwrite', async (store) => {
      const row: unknown = await request(store(STORE).get(manifest.id));
      if (!isLessonRow(row)) throw new Error('This lesson is no longer on this device.');
      await request(store(STORE).put({ ...row, manifest }));
    }),
  );
}

export function removeLesson(id: string): Promise<void> {
  return queued(id, () =>
    transact(LESSONS_DATABASE, STORE, 'readwrite', (store) => request(store(STORE).delete(id))),
  );
}
