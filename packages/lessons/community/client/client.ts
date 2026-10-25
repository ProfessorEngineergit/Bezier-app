/**
 * Community server client: browse the catalogue and download lessons.
 *
 * The server is untrusted. Downloads are capped at the catalogue size, checked against its hash,
 * and then read like any imported package.
 */

import type { LessonLevel, StoredLesson } from '../../src/format/manifest.js';
import { readPackage } from '../../src/format/package.js';
import { type CatalogEntry, type CatalogPage, isCatalogPage } from './catalog.js';
import type { Source } from './sources.js';

export interface CatalogQuery {
  q?: string;
  level?: LessonLevel;
  cursor?: string;
}

type Fetch = typeof fetch;

const unreachable = (source: Source) =>
  new Error(`Could not reach ${source.name}. Check your connection and try again.`);

export async function listCommunity(
  source: Source,
  query: CatalogQuery,
  signal?: AbortSignal,
  fetchImpl: Fetch = fetch,
): Promise<CatalogPage> {
  const params = new URLSearchParams();
  if (query.q !== undefined && query.q.trim() !== '') params.set('q', query.q.trim());
  if (query.level !== undefined) params.set('level', query.level);
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  let response: Response;
  try {
    response = await fetchImpl(`${source.url}/v1/lessons?${params}`, {
      ...(signal === undefined ? {} : { signal }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn('Community request failed.', error);
    throw unreachable(source);
  }
  if (!response.ok) {
    console.warn('Community server answered', response.status);
    throw new Error(`${source.name} could not list its lessons right now. Try again later.`);
  }
  const page: unknown = await response.json().catch(() => null);
  if (!isCatalogPage(page)) {
    throw new Error(`${source.name} sent a list this app cannot read.`);
  }
  return page;
}

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

/** Reads a body, aborting as soon as it exceeds `limit`. */
async function readCapped(
  response: Response,
  limit: number,
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('empty body');
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel();
      throw new Error('too large');
    }
    chunks.push(value);
    onProgress?.(received / limit);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Downloads and reads a catalogue entry's lesson. Throws a user-facing error; the technical cause
 * goes to the console.
 */
export async function downloadCommunityLesson(
  source: Source,
  entry: CatalogEntry,
  options: { signal?: AbortSignal; onProgress?: (fraction: number) => void; fetch?: Fetch } = {},
): Promise<StoredLesson> {
  const fetchImpl = options.fetch ?? fetch;
  let bytes: Uint8Array;
  try {
    const response = await fetchImpl(`${source.url}/v1/lessons/${entry.id}/package`, {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    bytes = await readCapped(response, entry.size, options.onProgress);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    console.warn('Community download failed.', error);
    throw new Error(`Could not download “${entry.title}” from ${source.name}. Try again later.`);
  }
  const digest = hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  if (bytes.byteLength !== entry.size || digest !== entry.sha256) {
    throw new Error(`“${entry.title}” did not arrive intact. Try downloading it again.`);
  }
  return readPackage(bytes);
}
