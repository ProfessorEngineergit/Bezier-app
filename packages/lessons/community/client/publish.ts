/**
 * Uploads to a community server and tracks their review status.
 *
 * Upload tokens are issued by the server owner and stored per server. They can only upload; every
 * upload waits for a moderator's approval.
 */

import type { Source } from './sources.js';

const KEY = 'bezier-lessons:upload-tokens';

type Tokens = Record<string, string>;

function readTokens(storage: Pick<Storage, 'getItem'>): Tokens {
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

export function uploadToken(
  source: Source,
  storage: Pick<Storage, 'getItem'> = localStorage,
): string {
  return readTokens(storage)[source.url] ?? '';
}

export function rememberUploadToken(
  source: Source,
  token: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): void {
  const tokens = readTokens(storage);
  if (token === '') delete tokens[source.url];
  else tokens[source.url] = token;
  try {
    storage.setItem(KEY, JSON.stringify(tokens));
  } catch (error) {
    console.warn('Could not remember the upload token.', error);
  }
}

export type UploadStatus = 'pending' | 'approved' | 'rejected' | 'removed';

export interface MyUpload {
  id: string;
  title: string;
  status: UploadStatus;
  /** The moderator's reason for a rejection or removal. */
  note: string;
}

const STATUSES: readonly string[] = ['pending', 'approved', 'rejected', 'removed'];

const serverError = async (response: Response, fallback: string): Promise<string> => {
  const body: unknown = await response.json().catch(() => null);
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error.length <= 300 ? error : fallback;
};

/** Sends a package for review. Uses XMLHttpRequest because fetch cannot report upload progress. */
export function uploadLesson(
  source: Source,
  token: string,
  bytes: Uint8Array,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${source.url}/v1/lessons`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new Error(`Could not reach ${source.name}. Try again later.`));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Handled below as an unrecognised response.
      }
      const result = body as { id?: unknown; error?: unknown } | null;
      if (xhr.status === 202 && typeof result?.id === 'string') {
        resolve({ id: result.id });
        return;
      }
      const message =
        typeof result?.error === 'string' && result.error.length <= 300
          ? result.error
          : `${source.name} did not accept the upload. Try again later.`;
      reject(new Error(message));
    };
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(bytes as BufferSource);
  });
}

export async function listMyUploads(
  source: Source,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MyUpload[]> {
  let response: Response;
  try {
    response = await fetchImpl(`${source.url}/v1/mine`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  } catch (error) {
    console.warn('Listing uploads failed.', error);
    throw new Error(`Could not reach ${source.name}. Try again later.`);
  }
  if (!response.ok) {
    throw new Error(await serverError(response, 'Could not load your uploads.'));
  }
  const body: unknown = await response.json().catch(() => null);
  const lessons = (body as { lessons?: unknown } | null)?.lessons;
  if (!Array.isArray(lessons)) return [];
  return lessons
    .filter(
      (l): l is MyUpload =>
        l !== null &&
        typeof l === 'object' &&
        typeof l.id === 'string' &&
        typeof l.title === 'string' &&
        typeof l.note === 'string' &&
        STATUSES.includes(l.status),
    )
    .slice(0, 200);
}
