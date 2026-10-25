/**
 * Plugin server client: browse, download, check for updates and revocations, report. Uploading is
 * in publish.ts.
 */

import type { Source } from '../../client/sources.js';
import { type PluginPackage, readPluginPackage } from '../format/package.js';
import {
  isPluginDetail,
  isPluginPage,
  type PluginDetail,
  type PluginEntry,
  type PluginPage,
} from './catalog.js';

type Fetch = typeof fetch;

const OPTIONS = { credentials: 'omit', referrerPolicy: 'no-referrer' } as const;

async function getJson(source: Source, path: string, fetchImpl: Fetch, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetchImpl(`${source.url}${path}`, {
      ...OPTIONS,
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn('Plugin server request failed.', error);
    throw new Error(`Could not reach ${source.name}. Check your connection and try again.`);
  }
  if (!response.ok) throw new Error(`${source.name} could not answer right now. Try again later.`);
  return response.json().catch(() => null) as Promise<unknown>;
}

export async function fetchPluginServerInfo(url: string, fetchImpl: Fetch = fetch) {
  const body = await getJson(
    { url, name: 'That server', enabled: true },
    '/v1/info',
    fetchImpl,
  ).catch(() => {
    throw new Error('No plugin server answered at that address. Check it and try again.');
  });
  const info = body as { name?: unknown; kind?: unknown } | null;
  if (info?.kind !== 'plugins' || typeof info.name !== 'string') {
    throw new Error('That server is not a Bezier plugin server.');
  }
  return { name: info.name.slice(0, 60) };
}

export async function listPlugins(
  source: Source,
  query: { q?: string; offline?: boolean; cursor?: string },
  signal?: AbortSignal,
  fetchImpl: Fetch = fetch,
): Promise<PluginPage> {
  const params = new URLSearchParams();
  if (query.q !== undefined && query.q.trim() !== '') params.set('q', query.q.trim());
  if (query.offline === true) params.set('offline', '1');
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  const page = await getJson(source, `/v1/plugins?${params}`, fetchImpl, signal);
  if (!isPluginPage(page)) throw new Error(`${source.name} sent a list this app cannot read.`);
  return page;
}

export async function pluginDetail(
  source: Source,
  id: string,
  fetchImpl: Fetch = fetch,
): Promise<PluginDetail> {
  const detail = await getJson(source, `/v1/plugins/${encodeURIComponent(id)}`, fetchImpl);
  if (!isPluginDetail(detail))
    throw new Error(`${source.name} sent an answer this app cannot read.`);
  return detail;
}

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Downloads and verifies a catalogue entry's package: size and hash must match the entry, and the
 * manifest must have the same id and version. Permissions come from the manifest, not the
 * catalogue.
 */
export async function downloadPlugin(
  source: Source,
  entry: PluginEntry,
  fetchImpl: Fetch = fetch,
): Promise<PluginPackage & { sha256: string }> {
  let bytes: Uint8Array;
  try {
    const response = await fetchImpl(
      `${source.url}/v1/plugins/${entry.id}/versions/${entry.version}/package`,
      OPTIONS,
    );
    if (!response.ok) throw new Error(`status ${response.status}`);
    const length = Number(response.headers.get('content-length') ?? entry.size);
    if (length > entry.size) throw new Error('larger than promised');
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    console.warn('Plugin download failed.', error);
    throw new Error(`Could not download “${entry.name}”. Try again later.`);
  }
  const digest = hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  if (bytes.byteLength !== entry.size || digest !== entry.sha256) {
    throw new Error(`“${entry.name}” did not arrive intact. Try again.`);
  }
  const plugin = await readPluginPackage(bytes);
  if (plugin.manifest.id !== entry.id || plugin.manifest.pluginVersion !== entry.version) {
    throw new Error(
      `“${entry.name}” is not what ${source.name} said it was. It was not installed.`,
    );
  }
  return { ...plugin, sha256: digest };
}

export async function reportPlugin(
  source: Source,
  id: string,
  reason: string,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  try {
    const response = await fetchImpl(`${source.url}/v1/plugins/${encodeURIComponent(id)}/report`, {
      ...OPTIONS,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
  } catch (error) {
    console.warn('Report failed.', error);
    throw new Error('The report did not go through. Try again in a moment.');
  }
}
