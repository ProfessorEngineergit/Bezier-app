/**
 * The result of the last look for a newer version, shared by the start-up hint and Settings →
 * Updates. Nothing is asked unless `checkForUpdate` is called.
 */

import { useSyncExternalStore } from 'react';
import { fetchLatest, isNewer, type Release } from './updates.js';

export interface UpdateState {
  status: 'idle' | 'checking' | 'current' | 'available' | 'failed';
  release: Release | null;
}

let state: UpdateState = { status: 'idle', release: null };
const listeners = new Set<() => void>();

function set(next: UpdateState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** Asks GitHub for the newest stable release and says whether it is newer than `installed`. */
export async function checkForUpdate(installed: string): Promise<UpdateState> {
  if (state.status === 'checking') return state;
  set({ status: 'checking', release: state.release });
  try {
    const release = await fetchLatest();
    set({ status: isNewer(release.version, installed) ? 'available' : 'current', release });
  } catch {
    set({ status: 'failed', release: null });
  }
  return state;
}
