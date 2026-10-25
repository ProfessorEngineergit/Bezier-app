/**
 * The release channel this device follows: stable, beta or alpha (by invitation). Each channel
 * includes the ones before it. The Settings switch applies immediately, without a reload.
 *
 * Every feature that talks to a third-party server (community store, plugins, shared projects, wiki
 * editing, self-hosted servers) is alpha-only; stable and beta make no server requests. The app
 * starts on stable.
 *
 * Alpha requires a valid invitation (`alpha.ts`); without one, choosing alpha reads as beta.
 */

import { alphaOpen, onAlphaChange } from './alpha.js';
import { BUILD_CHANNEL } from './build-channel.js';

export type Channel = 'stable' | 'beta' | 'alpha';
/** The channel a feature requires. */
export type Gate = 'beta' | 'alpha';

const ORDER: Record<Channel, number> = { stable: 0, beta: 1, alpha: 2 };

/** Whether a feature behind `gate` is available on `channel`. */
export function reaches(channel: Channel, gate: Gate): boolean {
  return ORDER[channel] >= ORDER[gate];
}

const KEY = 'bezier.channel';

type Reads = Pick<Storage, 'getItem'>;
type Writes = Pick<Storage, 'setItem'>;

/** The stored choice, regardless of invitation. */
export function readChannel(storage: Reads | null = browserStorage()): Channel {
  try {
    const stored = storage?.getItem(KEY);
    return stored === 'beta' || stored === 'alpha' ? stored : BUILD_CHANNEL;
  } catch {
    return BUILD_CHANNEL;
  }
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();

/** Subscribes to channel changes, including from other windows; for `useSyncExternalStore`. */
export function onChannelChange(listener: () => void): () => void {
  listeners.add(listener);
  const stopAlpha = onAlphaChange(listener);
  // Follow changes made in other windows.
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  if (typeof addEventListener === 'function') addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    stopAlpha();
    if (typeof removeEventListener === 'function') removeEventListener('storage', onStorage);
  };
}

let memory: Channel = BUILD_CHANNEL;
/** Set when storage refuses a write; `memory` is then authoritative for this session. */
let unstorable = false;

export function setChannel(next: Channel, storage: Writes | null = browserStorage()): void {
  memory = next;
  try {
    if (storage === null) unstorable = true;
    else storage.setItem(KEY, next);
  } catch (error) {
    // Without storage the choice lasts for this session only.
    console.warn('Could not remember the release channel.', error);
    unstorable = true;
  }
  for (const listener of listeners) listener();
}

/** The chosen channel, as shown by the Settings switch. */
export function chosenChannel(): Channel {
  return unstorable ? memory : readChannel();
}

/** The effective channel: the choice, or beta when alpha has no valid invitation. */
export function currentChannel(): Channel {
  const chosen = chosenChannel();
  return chosen === 'alpha' && !alphaOpen() ? 'beta' : chosen;
}
