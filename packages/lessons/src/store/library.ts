/**
 * Summaries, progress and posters for the home, kept in the app database so the list loads without
 * reading any video.
 */

import type { LessonManifest } from '../format/manifest.js';
import { type LessonSummary, newestFirst, summarize } from '../format/summary.js';
import { APP_DATABASE } from './app-database.js';
import { getAll, request, transact } from './database.js';
import { allRows, getRow, lessonKeys } from './lessons.js';
import { rowBytes } from './rows.js';

export interface Progress {
  id: string;
  /** Lesson time, seconds. */
  time: number;
  updatedAt: string;
}

async function storedSummaries(): Promise<Map<string, LessonSummary>> {
  const rows = await transact(APP_DATABASE, 'summaries', 'readonly', (store) =>
    getAll<LessonSummary>(store('summaries')),
  );
  return new Map(rows.map((summary) => [summary.id, summary]));
}

/**
 * All lessons on this device, newest first. Summaries are reconciled with the lesson store's keys,
 * so lessons added or deleted by another editor build are picked up.
 */
export async function listLessons(): Promise<LessonSummary[]> {
  const keys = await lessonKeys();
  const known = await storedSummaries();
  const missing = keys.filter((id) => !known.has(id));
  const stale = [...known.keys()].filter((id) => !keys.includes(id));
  const fresh: LessonSummary[] = [];
  if (missing.length > 0) {
    // Read everything when most lessons are new; otherwise fetch only the missing ones.
    const rows =
      missing.length > keys.length / 2
        ? await allRows()
        : (await Promise.all(missing.map(getRow))).filter((row) => row !== null);
    for (const row of rows) {
      if (missing.includes(row.id)) fresh.push(summarize(row.manifest, rowBytes(row)));
    }
  }
  if (fresh.length > 0 || stale.length > 0) {
    await transact(APP_DATABASE, 'summaries', 'readwrite', async (store) => {
      for (const summary of fresh) await request(store('summaries').put(summary));
      for (const id of stale) await request(store('summaries').delete(id));
    });
  }
  for (const id of stale) known.delete(id);
  for (const summary of fresh) known.set(summary.id, summary);
  return [...known.values()].filter((summary) => keys.includes(summary.id)).sort(newestFirst);
}

/** Updates a summary after a write. Without `bytes`, the stored size is kept. */
export function rememberSummary(manifest: LessonManifest, bytes?: number): Promise<void> {
  return transact(APP_DATABASE, 'summaries', 'readwrite', async (store) => {
    const known: unknown = await request(store('summaries').get(manifest.id));
    const size = bytes ?? (known as LessonSummary | undefined)?.bytes ?? 0;
    await request(store('summaries').put(summarize(manifest, size)));
  });
}

/** Removes the app's summary, progress and poster for a deleted lesson. */
export function forgetLesson(id: string): Promise<void> {
  const names = ['summaries', 'progress', 'posters'];
  return transact(APP_DATABASE, names, 'readwrite', async (store) => {
    for (const name of names) await request(store(name).delete(id));
  });
}

export function saveProgress(id: string, time: number): Promise<void> {
  const progress: Progress = { id, time, updatedAt: new Date().toISOString() };
  return transact(APP_DATABASE, 'progress', 'readwrite', async (store) => {
    await request(store('progress').put(progress));
  });
}

export function clearProgress(id: string): Promise<void> {
  return transact(APP_DATABASE, 'progress', 'readwrite', async (store) => {
    await request(store('progress').delete(id));
  });
}

export async function loadProgress(): Promise<Map<string, Progress>> {
  const rows = await transact(APP_DATABASE, 'progress', 'readonly', (store) =>
    getAll<Progress>(store('progress')),
  );
  return new Map(rows.map((row) => [row.id, row]));
}

export async function getPoster(id: string): Promise<Blob | undefined> {
  const row = await transact(APP_DATABASE, 'posters', 'readonly', (store) =>
    request(store('posters').get(id)),
  );
  const image: unknown = (row as { image?: unknown } | undefined)?.image;
  const bytes: unknown = (row as { bytes?: unknown } | undefined)?.bytes;
  if (bytes instanceof Uint8Array) return new Blob([bytes as BlobPart], { type: 'image/jpeg' });
  return image instanceof Blob ? image : undefined;
}

export async function putPoster(id: string, image: Blob): Promise<void> {
  // Stored as bytes: WebKit cannot reliably structured-clone canvas blobs.
  const bytes = new Uint8Array(await image.arrayBuffer());
  await transact(APP_DATABASE, 'posters', 'readwrite', async (store) => {
    await request(store('posters').put({ id, bytes }));
  });
}
