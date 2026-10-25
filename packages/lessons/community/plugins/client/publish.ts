/**
 * Submits plugins for review and tracks their status. Tokens are issued by the server owner and
 * can only submit, never publish.
 */

import type { Source } from '../../client/sources.js';

export interface MyPluginUpload {
  id: string;
  version: string;
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  note: string;
}

const STATUSES: readonly string[] = ['pending', 'approved', 'rejected', 'revoked'];

const errorOf = (body: unknown, fallback: string): string => {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error.length <= 300 ? error : fallback;
};

export async function uploadPlugin(
  source: Source,
  token: string,
  bytes: Uint8Array,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(`${source.url}/v1/plugins`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: bytes as BodyInit,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    console.warn('Plugin upload failed.', error);
    throw new Error(`Could not reach ${source.name}. Try again later.`);
  }
  if (response.status !== 202) {
    throw new Error(
      errorOf(await response.json().catch(() => null), 'The upload was not accepted.'),
    );
  }
}

export async function listMyPlugins(
  source: Source,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MyPluginUpload[]> {
  const response = await fetchImpl(`${source.url}/v1/mine`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  }).catch(() => null);
  if (response === null) throw new Error(`Could not reach ${source.name}. Try again later.`);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorOf(body, 'Could not load your plugins.'));
  const list = (body as { plugins?: unknown } | null)?.plugins;
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (p): p is MyPluginUpload =>
        p !== null &&
        typeof p === 'object' &&
        typeof p.id === 'string' &&
        typeof p.version === 'string' &&
        typeof p.note === 'string' &&
        STATUSES.includes(p.status),
    )
    .slice(0, 200);
}
