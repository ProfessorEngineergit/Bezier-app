import { isTauri } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { live } from './automation/live.js';
import { glassFor, paintFor } from './glass-fallback.js';
import { setNibSettings } from './nib.js';
import { type AppPrefs, PREFS_STORAGE_KEY, readPrefs, serializePrefs } from './preferences.js';
import { LIGHTER_DISPLAY, onSettingsRequest } from './settings-request.js';

export interface PrefsHandle {
  prefs: AppPrefs;
  setPrefs: (next: AppPrefs) => void;
  prefsOpen: boolean;
  setPrefsOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
}

export function usePrefs(): PrefsHandle {
  const [prefs, setPrefs] = useState<AppPrefs>(() =>
    readPrefs(typeof window === 'undefined' ? null : window.localStorage),
  );
  const [prefsOpen, setPrefsOpen] = useState(false);

  useEffect(() => {
    const el = window.document.documentElement;
    if (prefs.theme === 'system') {
      el.removeAttribute('data-theme');
    } else {
      el.dataset.theme = prefs.theme;
    }
    el.dataset.interfaceScale = prefs.interfaceScale;
    el.dataset.density = prefs.density;
    el.dataset.glass = glassFor(prefs.glass);
    el.dataset.paint = paintFor();
    el.dataset.contrast = prefs.contrast;
    el.dataset.motion = prefs.motion;
    setNibSettings(prefs);
    // Overrides the theme value in both themes. The 3D views read it from here too (Viewport.tsx).
    el.style.setProperty('--select', prefs.selectionColour);
    try {
      window.localStorage.setItem(PREFS_STORAGE_KEY, serializePrefs(prefs));
    } catch {
      // Private browsing may reject storage; settings still apply for this run.
    }
  }, [prefs]);

  // Apply the theme to the native window frame too: on Windows the title and menu bar are the
  // system's and stay light over a dark app. System lets the OS decide both.
  useEffect(() => {
    if (!isTauri()) return;
    const theme = prefs.theme === 'system' ? null : prefs.theme;
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(theme))
      .catch(() => undefined);
  }, [prefs.theme]);

  // Requests from Nib's own root: Settings at his section, or a lighter display.
  useEffect(() => onSettingsRequest(() => setPrefsOpen(true)), []);
  useEffect(() => {
    // Fewer facets and no blur: on a weak GPU the blur is redrawn under every frame of the model.
    const lighter = () => setPrefs((current) => ({ ...current, detail: 'light', glass: 'solid' }));
    window.addEventListener(LIGHTER_DISPLAY, lighter);
    return () => window.removeEventListener(LIGHTER_DISPLAY, lighter);
  }, []);

  live.prefs = prefs;
  live.setPrefs = setPrefs;
  return { prefs, setPrefs, prefsOpen, setPrefsOpen };
}
