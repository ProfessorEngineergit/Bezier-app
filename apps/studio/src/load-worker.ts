/** Worker for `load-document.ts`: the same OPFS store, off the main thread. */

/// <reference lib="webworker" />

import type { JournalEntry, Operation } from '@bezier/core';
import { textKey } from '@bezier/kernel';
import { DocumentStore, OpfsBackend } from '@bezier/storage';
import { LONG_TEXT, type Loaded, longTexts } from './load-document.js';

/** A copy of `value` without long texts, for the history list. */
function withoutLongTexts<T>(value: T): T {
  if (typeof value === 'string') return (value.length > LONG_TEXT ? '' : value) as T;
  if (Array.isArray(value)) return value.map(withoutLongTexts) as T;
  if (typeof value === 'object' && value !== null) {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) copy[key] = withoutLongTexts(item);
    return copy as T;
  }
  return value;
}

self.addEventListener('message', (event: MessageEvent<{ id: string }>) => {
  void (async () => {
    try {
      const result = await new DocumentStore(new OpfsBackend()).load(event.data.id);
      const digests = longTexts(result.document.features).map(textKey);
      const entries: JournalEntry[] = result.entries.map((entry) => ({
        ...entry,
        op: withoutLongTexts<Operation>(entry.op),
      }));
      const loaded: Loaded = { result: { ...result, entries }, digests };
      self.postMessage(loaded);
    } catch (error) {
      self.postMessage({ failed: error instanceof Error ? error.message : String(error) });
    }
  })();
});
