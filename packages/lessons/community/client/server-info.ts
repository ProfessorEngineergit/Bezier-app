/**
 * A server's self-description, fetched when it is added to confirm it is a lessons server and to
 * get its display name.
 */

import type { Source } from './sources.js';

export interface ServerInfo {
  name: string;
  description: string;
  uploads: boolean;
}

type Fetch = typeof fetch;

export async function fetchServerInfo(url: string, fetchImpl: Fetch = fetch): Promise<ServerInfo> {
  let body: unknown;
  try {
    const response = await fetchImpl(`${url}/v1/info`, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    body = await response.json();
  } catch (error) {
    console.warn('Server info failed.', error);
    throw new Error('No lessons server answered at that address. Check it and try again.');
  }
  const info = body as Partial<Record<keyof ServerInfo, unknown>> | null;
  if (
    info === null ||
    typeof info !== 'object' ||
    typeof info.name !== 'string' ||
    typeof info.description !== 'string'
  ) {
    throw new Error('That server is not a Bezier lessons server.');
  }
  return {
    name: info.name.slice(0, 60),
    description: info.description.slice(0, 300),
    uploads: info.uploads === true,
  };
}

export type ReportReason = 'disturbing' | 'spam' | 'not-a-lesson' | 'other';

/** Reports a lesson. Fire and forget: the server responds the same way regardless. */
export async function reportLesson(
  source: Source,
  id: string,
  reason: ReportReason,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  try {
    const response = await fetchImpl(`${source.url}/v1/lessons/${id}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
  } catch (error) {
    console.warn('Report failed.', error);
    throw new Error('The report did not go through. Try again in a moment.');
  }
}
