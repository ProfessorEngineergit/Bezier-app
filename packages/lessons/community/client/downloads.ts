/**
 * Maps downloaded community lessons to their local ids. Imports get a fresh id, so this map is how
 * a card knows the lesson is already in the library.
 */

import type { Source } from './sources.js';

const KEY = 'bezier-lessons:community-downloads';

type Downloads = Record<string, string>;

const key = (source: Source, id: string) => `${source.url}#${id}`;

function read(storage: Pick<Storage, 'getItem'>): Downloads {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? '{}');
    if (parsed === null || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
  } catch {
    return {};
  }
}

export function localIdFor(
  source: Source,
  id: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): string | undefined {
  return read(storage)[key(source, id)];
}

export function rememberDownload(
  source: Source,
  id: string,
  localId: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): void {
  const downloads = read(storage);
  downloads[key(source, id)] = localId;
  try {
    storage.setItem(KEY, JSON.stringify(downloads));
  } catch (error) {
    console.warn('Could not remember a download.', error);
  }
}
