/** The community store as React state, shared by the page and Settings. */

import { useSyncExternalStore } from 'react';
import { type CommunityStore, onStoreChange, readStore } from '../client/store.js';

// Read lazily, not at module load: the package is also imported in Node (the docs coverage test).
let last: CommunityStore | null = null;

// `useSyncExternalStore` needs a stable object while nothing changed.
function snapshot(): CommunityStore {
  const next = readStore();
  if (last === null) last = next;
  if (
    last === null ||
    next.url !== last.url ||
    next.on !== last.on ||
    next.name !== last.name ||
    next.custom !== last.custom
  )
    last = next;
  return last;
}

export function useCommunityStore(): CommunityStore {
  return useSyncExternalStore(onStoreChange, snapshot);
}
