/**
 * The community store: one address serving lessons (`/lessons`), docs and plugins (`/plugins`),
 * plus an on/off switch.
 *
 * Off by default; no server is contacted until the user enables it. The address is Bezier's own
 * store unless a custom one is set in Settings. Browsing needs no account; uploading needs a token
 * from the server owner.
 */

import { fetchPluginServerInfo } from '../plugins/client/api.js';
import { type Channel, currentChannel, onChannelChange, reaches } from './channel.js';
import { fetchServerInfo } from './server-info.js';
import { normalizeSourceUrl, type Source } from './sources.js';

/**
 * Bezier's own store, from VITE_STORE_URL (see deploy/compose.yaml). Empty when unset; the page
 * then says the store is not available yet, and a custom address can still be set.
 */
export const OFFICIAL_STORE_URL: string =
  (import.meta as ImportMeta & { env?: { VITE_STORE_URL?: string } }).env?.VITE_STORE_URL ?? '';
export const OFFICIAL_STORE_NAME = 'Bezier Community';

const ON = 'bezier-community:on';
const ADDRESS = 'bezier-community:address';

export interface CommunityStore {
  /** Empty when no store is configured. */
  url: string;
  name: string;
  on: boolean;
  /** True for a custom address set in Settings. */
  custom: boolean;
}

type Reads = Pick<Storage, 'getItem'>;
type Writes = Pick<Storage, 'setItem' | 'removeItem'>;

const read = (storage: Reads, key: string): string | null => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

export function readStore(
  storage: Reads = localStorage,
  channel: Channel = currentChannel(),
): CommunityStore {
  const typed = read(storage, ADDRESS) ?? '';
  const url = typed === '' ? OFFICIAL_STORE_URL : typed;
  let name = OFFICIAL_STORE_NAME;
  if (typed !== '') {
    try {
      name = new URL(typed).host;
    } catch {
      name = typed;
    }
  }
  // The store is alpha-only. Below alpha it is off, but the stored choice is kept.
  const alpha = reaches(channel, 'alpha');
  return {
    url,
    name,
    on: alpha && url !== '' && read(storage, ON) === 'yes',
    custom: typed !== '',
  };
}

const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};

/** Subscribes to store changes; for `useSyncExternalStore`. */
export function onStoreChange(listener: () => void): () => void {
  listeners.add(listener);
  const unlisten = onChannelChange(listener);
  return () => {
    listeners.delete(listener);
    unlisten();
  };
}

export function setStoreOn(on: boolean, storage: Writes = localStorage): void {
  try {
    storage.setItem(ON, on ? 'yes' : 'no');
  } catch (error) {
    console.warn('Could not remember the community switch.', error);
  }
  changed();
}

/** Sets a custom address, or '' for Bezier's own. Throws on an invalid address. */
export function setStoreAddress(input: string, storage: Writes = localStorage): void {
  const url = input.trim() === '' ? '' : normalizeSourceUrl(input);
  try {
    if (url === '') storage.removeItem(ADDRESS);
    else storage.setItem(ADDRESS, url);
  } catch (error) {
    console.warn('Could not remember the community address.', error);
  }
  changed();
}

/**
 * Checks that an address serves both lessons and plugins and returns its name. Called before
 * saving, so a mistyped address is rejected immediately.
 */
export async function checkStore(input: string): Promise<string> {
  const url = normalizeSourceUrl(input);
  const info = await fetchServerInfo(`${url}/lessons`);
  await fetchPluginServerInfo(`${url}/plugins`);
  return info.name;
}

/** The store's lessons endpoint as a `Source`. */
export const lessonsOf = (store: CommunityStore): Source => ({
  url: `${store.url}/lessons`,
  name: store.name,
  enabled: store.on,
});

/** The store's docs endpoint as a `Source`. */
export const docsOf = (store: CommunityStore): Source => ({
  url: `${store.url}/docs`,
  name: store.name,
  enabled: store.on,
});

/** The store's plugins endpoint as a `Source`. */
export const pluginsOf = (store: CommunityStore): Source => ({
  url: `${store.url}/plugins`,
  name: store.name,
  enabled: store.on,
});
