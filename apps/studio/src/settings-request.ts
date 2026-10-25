/**
 * Opens Settings at a section from outside the app's React tree (Nib's island has its own root,
 * `island/mount.ts`). The section is held here until the Settings page reads it.
 */

import type { SettingsTab } from './settings-catalog.js';

const EVENT = 'bezier:settings-request';
let pending: SettingsTab | null = null;

/** Opens Settings at `tab`. */
export function requestSettings(tab: SettingsTab): void {
  pending = tab;
  window.dispatchEvent(new Event(EVENT));
}

/** The requested section, once; null when none. */
export function takeSettingsRequest(): SettingsTab | null {
  const tab = pending;
  pending = null;
  return tab;
}

/** Called when Settings is asked for. */
export function onSettingsRequest(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** Event for the island's "lighter display": `detail: light` and solid panels (`glass`). */
export const LIGHTER_DISPLAY = 'bezier:lighter-display';

const DONE = 'bezier:settings-done';

/** Leaves Settings as Escape does: back to the project it was opened from, if any. */
export function closeSettings(): void {
  window.dispatchEvent(new Event(DONE));
}

/** Called when Settings should close. */
export function onSettingsDone(listener: () => void): () => void {
  window.addEventListener(DONE, listener);
  return () => window.removeEventListener(DONE, listener);
}
