import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Notice } from './notification-types.js';

interface Source {
  notices: readonly Notice[];
  onDismiss: (id: string) => void;
}

export interface NotificationFeed {
  notices: readonly Notice[];
  onDismiss: (id: string) => void;
}

const sources = new Map<string, Source>();
const listeners = new Set<() => void>();
let nextSource = 0;
let snapshot: NotificationFeed = { notices: [], onDismiss: () => undefined };

function publish(): void {
  const notices: Notice[] = [];
  const dismissers = new Map<string, () => void>();

  for (const [sourceId, source] of sources) {
    for (const notice of source.notices) {
      const id = `${sourceId}/${notice.id}`;
      notices.push({ ...notice, id });
      dismissers.set(id, () => source.onDismiss(notice.id));
    }
  }

  snapshot = {
    notices,
    onDismiss: (id) => dismissers.get(id)?.(),
  };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function removeSource(id: string): void {
  if (!sources.delete(id)) return;
  publish();
}

/**
 * Lets code outside the shell register notices without moving their lifecycle into presentation
 * code. Needed because the title bar and the notice producers are siblings whose common parent is
 * outside the shell.
 */
export function useNotificationSource(
  notices: readonly Notice[],
  onDismiss: (id: string) => void,
): void {
  const [sourceId] = useState(() => {
    nextSource += 1;
    return `source-${nextSource}`;
  });
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const dismiss = useCallback((id: string) => dismissRef.current(id), []);

  useEffect(() => () => removeSource(sourceId), [sourceId]);
  useEffect(() => {
    sources.set(sourceId, { notices, onDismiss: dismiss });
    publish();
  }, [dismiss, notices, sourceId]);
}

export function useNotificationFeed(): NotificationFeed {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
