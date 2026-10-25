/**
 * Loads a document in a worker so the page does not freeze. Loading reads, parses and replays the
 * snapshot and journal; one import can be 241 MB of STEP (the Voron), 1.4 to 3.2 s on the main
 * thread in WebKit. The worker returns the document with digests of its long texts (`textKey`)
 * already computed. Returned journal entries are for the history list and omit long texts.
 *
 * When the worker cannot help (no workers, no OPFS, any failure) the document loads on the page.
 */

import { rememberTextKey } from '@bezier/kernel';
import type { DocumentStore, LoadResult } from '@bezier/storage';

/** Text this long travels with its digest. Matches `params.ts`. */
export const LONG_TEXT = 64 * 1024;

/** The long texts in a value, in walk order. */
export function longTexts(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value.length > LONG_TEXT) found.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) longTexts(item, found);
  } else if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) longTexts((value as Record<string, unknown>)[key], found);
  }
  return found;
}

export interface Loaded {
  result: LoadResult;
  /** `textKey` of each of `longTexts(result.document.features)`, in that order. */
  digests: readonly string[];
}

export async function loadDocument(
  store: DocumentStore,
  id: string,
  offThread: boolean,
): Promise<LoadResult> {
  if (offThread && typeof Worker !== 'undefined') {
    try {
      const loaded = await inWorker(id);
      longTexts(loaded.result.document.features).forEach((text, index) => {
        const digest = loaded.digests[index];
        if (digest !== undefined) rememberTextKey(text, digest);
      });
      return loaded.result;
    } catch {
      // Fall back to loading on the page.
    }
  }
  return store.load(id);
}

function inWorker(id: string): Promise<Loaded> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./load-worker.ts', import.meta.url), {
      type: 'module',
      name: 'bezier-load',
    });
    worker.addEventListener('message', (event: MessageEvent<Loaded | { failed: string }>) => {
      worker.terminate();
      if ('failed' in event.data) reject(new Error(event.data.failed));
      else resolve(event.data);
    });
    worker.addEventListener('error', (event) => {
      worker.terminate();
      reject(new Error(event.message));
    });
    worker.postMessage({ id });
  });
}
