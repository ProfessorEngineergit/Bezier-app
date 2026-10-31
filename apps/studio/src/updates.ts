/**
 * Asking GitHub for the newest stable release, and comparing it with the installed version.
 * Only the desktop app asks, and only when the setting is on (use-update-check.ts).
 */

/** The releases of the app repository; stable installers are published there. */
export const LATEST_RELEASE_URL =
  'https://api.github.com/repos/ProfessorEngineergit/Bezier-app/releases/latest';

export interface Release {
  version: string;
  name: string;
  /** The notes GitHub holds for the release, as written there. */
  notes: string;
  /** The release page, where the installers are. */
  url: string;
  published: string;
}

/** "v1.2.3" or "1.2.3-beta.1" as three numbers, or null when it is not a version. */
export function parseVersion(text: string): [number, number, number] | null {
  const found = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(text.trim());
  if (found === null) return null;
  return [Number(found[1]), Number(found[2]), Number(found[3])];
}

/** Whether `latest` is a higher version than `current`. Anything that is no version is not newer. */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (a === null || b === null) return false;
  for (let part = 0; part < 3; part += 1) {
    const x = a[part] ?? 0;
    const y = b[part] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** What GitHub answers with, checked field by field. */
export function parseRelease(body: unknown): Release | null {
  if (typeof body !== 'object' || body === null) return null;
  const source = body as Record<string, unknown>;
  const tag = source.tag_name;
  const url = source.html_url;
  if (typeof tag !== 'string' || typeof url !== 'string') return null;
  if (parseVersion(tag) === null || !url.startsWith('https://github.com/')) return null;
  return {
    version: tag.replace(/^v/, ''),
    name: typeof source.name === 'string' && source.name !== '' ? source.name : tag,
    notes: typeof source.body === 'string' ? source.body.trim() : '',
    url,
    published: typeof source.published_at === 'string' ? source.published_at : '',
  };
}

export async function fetchLatest(
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<Release> {
  const response = await fetcher(LATEST_RELEASE_URL, {
    headers: { Accept: 'application/vnd.github+json' },
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}.`);
  const release = parseRelease(await response.json());
  if (release === null) throw new Error('GitHub sent a release this app does not understand.');
  return release;
}
