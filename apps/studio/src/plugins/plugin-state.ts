/**
 * Plugin runtime state shared with the start page: the runtime, so install and disable take
 * effect at once, and why plugins were stopped. Outside React because the editor creates the
 * runtime and the Community page uses it.
 */

import type { PluginRuntime } from '@bezier/lessons';
import { useSyncExternalStore } from 'react';

export interface PluginState {
  runtime: PluginRuntime | null;
  /** Why the runtime stopped a plugin, by id. */
  stopped: Record<string, string>;
}

let state: PluginState = { runtime: null, stopped: {} };
const listeners = new Set<() => void>();

export function setPluginState(change: (before: PluginState) => PluginState): void {
  state = change(state);
  for (const listener of listeners) listener();
}

export function usePluginState(): PluginState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
