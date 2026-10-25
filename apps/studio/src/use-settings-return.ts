/**
 * Settings lives on the start page. When opened from the editor, closing it (same key or Escape)
 * returns to the editor rather than the project list. Returns the close function.
 */

import { useCallback, useEffect, useRef } from 'react';
import { onSettingsDone } from './settings-request.js';

export function useSettingsReturn(
  prefsOpen: boolean,
  setPrefsOpen: (open: boolean) => void,
  dashboardOpen: boolean,
  setDashboardOpen: (open: boolean) => void,
): () => void {
  const dashboardOpenRef = useRef(dashboardOpen);
  dashboardOpenRef.current = dashboardOpen;
  const fromEditor = useRef(false);
  useEffect(() => {
    if (!prefsOpen) {
      fromEditor.current = false;
      return;
    }
    fromEditor.current = !dashboardOpenRef.current;
    setDashboardOpen(true);
  }, [setDashboardOpen, prefsOpen]);
  const close = useCallback(() => {
    if (fromEditor.current) setDashboardOpen(false);
    setPrefsOpen(false);
  }, [setDashboardOpen, setPrefsOpen]);
  // Also closed from inside the page, e.g. a lesson started in Settings › Nib returns to the work.
  useEffect(() => onSettingsDone(close), [close]);
  return close;
}
