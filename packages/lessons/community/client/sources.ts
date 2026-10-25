/**
 * Community sources: servers the user chose to browse lessons or plugins from, one list per kind.
 * The list starts empty, and sources can be disabled without being removed.
 */

export interface Source {
  /** Origin and path without a trailing slash, e.g. `https://lessons.example.org`. */
  url: string;
  name: string;
  enabled: boolean;
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/**
 * The canonical form of a server address. Plain `http` is allowed only for localhost, so content
 * cannot be tampered with in transit.
 */
export function normalizeSourceUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('That is not a web address. Use something like https://lessons.example.org.');
  }
  const local = LOCAL_HOSTS.includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('Community servers must use https.');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('Leave the user name and password out of the address.');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

const isSource = (value: unknown): value is Source => {
  if (value === null || typeof value !== 'object') return false;
  const s = value as Partial<Source>;
  return typeof s.url === 'string' && typeof s.name === 'string' && typeof s.enabled === 'boolean';
};

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export interface SourceList {
  load(storage?: Pick<Storage, 'getItem'>): Source[];
  add(input: string, name: string, storage?: Store): Source[];
  setEnabled(url: string, enabled: boolean, storage?: Store): Source[];
  remove(url: string, storage?: Store): Source[];
}

/** A list of servers stored under `key` in localStorage. */
export function sourceList(key: string): SourceList {
  /** Unavailable storage (private windows, previews) yields an empty list. */
  const load = (storage: Pick<Storage, 'getItem'> = localStorage): Source[] => {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(key) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter(isSource) : [];
    } catch {
      return [];
    }
  };

  const save = (sources: Source[], storage: Pick<Storage, 'setItem'>): Source[] => {
    try {
      storage.setItem(key, JSON.stringify(sources));
    } catch (error) {
      console.warn('Could not remember the community sources.', error);
    }
    return sources;
  };

  return {
    load,
    add(input, name, storage = localStorage) {
      const url = normalizeSourceUrl(input);
      const sources = load(storage);
      if (sources.some((source) => source.url === url)) {
        throw new Error('That server is already in your list.');
      }
      const label = name.trim() === '' ? new URL(url).hostname : name.trim().slice(0, 60);
      return save([...sources, { url, name: label, enabled: true }], storage);
    },
    setEnabled(url, enabled, storage = localStorage) {
      return save(
        load(storage).map((s) => (s.url === url ? { ...s, enabled } : s)),
        storage,
      );
    },
    remove(url, storage = localStorage) {
      return save(
        load(storage).filter((s) => s.url !== url),
        storage,
      );
    },
  };
}

/** The lesson servers. */
export const lessonSources = sourceList('bezier-lessons:sources');
export const loadSources = lessonSources.load;
export const addSource = lessonSources.add;
export const setSourceEnabled = lessonSources.setEnabled;
export const removeSource = lessonSources.remove;
