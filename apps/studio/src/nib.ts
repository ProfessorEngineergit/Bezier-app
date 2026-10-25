/**
 * Nib's app-wide controller and the settings that control how present and animated he is. Pages,
 * the editor and the title bar all reach the same instance through here.
 */

import { type Guide, NibController } from '@bezier/nib';
import { useSyncExternalStore } from 'react';
import type { NibStyle } from './nib-style.js';
import { type AppPrefs, type NibLevel, readPrefs } from './preferences.js';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const nib = new NibController({ storage: storage() });

interface NibSettings {
  /** The setting "Nib": off, quiet or friendly. */
  level: NibLevel;
  /** The start page figure and his greeting: friendly only. */
  enabled: boolean;
  /** Reduced motion, by setting or system: drawn as a still image. */
  still: boolean;
  /** Name, colours and which unprompted topics he may raise. */
  style: NibStyle;
}

const stillFor = (motion: AppPrefs['motion']): boolean =>
  motion === 'reduced' ||
  (motion === 'system' &&
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches);

function settingsOf(prefs: Pick<AppPrefs, 'nib' | 'motion' | 'nibStyle'>): NibSettings {
  return {
    level: prefs.nib,
    enabled: prefs.nib === 'friendly',
    still: stillFor(prefs.motion),
    style: prefs.nibStyle,
  };
}

const initial = readPrefs(storage());
let settings = settingsOf(initial);
// Unless off, he lives in the title bar rather than the corner.
nib.setIsland(settings.level !== 'off');
const listeners = new Set<() => void>();

/** Applies changed settings (`use-prefs.ts`). */
export function setNibSettings(prefs: Pick<AppPrefs, 'nib' | 'motion' | 'nibStyle'>): void {
  const next = settingsOf(prefs);
  if (
    next.level === settings.level &&
    next.still === settings.still &&
    next.style === settings.style
  )
    return;
  settings = next;
  nib.setIsland(next.level !== 'off');
  for (const listener of listeners) listener();
}

export function useNibSettings(): NibSettings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => settings,
  );
}

/** Dispatched on the window when a lesson starts, so the app can drop the current tool. */
export const GUIDE_START = 'bezier:guide-start';

/** Starts a guided lesson now. */
export function startGuide(guide: Guide): void {
  window.dispatchEvent(new Event(GUIDE_START));
  nib.startGuide(guide, performance.now() / 1000);
}
