/**
 * On first launch Nib appears and stays until answered, with the rest of the window behind a veil.
 * Shown once: either answer ends it, and "Not now" says where he waits (the top edge of the
 * window, `NibSummon.tsx`).
 */

import { useSyncExternalStore } from 'react';

let meeting = false;
const listeners = new Set<() => void>();

export function setFirstMeeting(on: boolean): void {
  if (meeting === on) return;
  meeting = on;
  for (const listener of listeners) listener();
}

export function useFirstMeeting(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => meeting,
  );
}
