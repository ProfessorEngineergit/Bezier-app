/**
 * A minimal subscribable value for state shared by both mount points and outliving any one
 * component. Components read it with `useObservable`.
 */

import { useSyncExternalStore } from 'react';

export interface Observable<T> {
  get(): T;
  set(value: T): void;
  update(change: (value: T) => T): void;
  subscribe(listener: () => void): () => void;
}

export function observable<T>(initial: T): Observable<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    },
    update(change) {
      this.set(change(value));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useObservable<T>(source: Observable<T>): T {
  return useSyncExternalStore(source.subscribe, source.get, source.get);
}
