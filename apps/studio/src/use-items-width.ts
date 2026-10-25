/**
 * Width of the Items panel in pixels, stored in local storage like the library sidebar's: it is a
 * per-machine habit, not document state.
 */

import { useEffect, useState } from 'react';
import { ITEMS_WIDTH_DEFAULT, ITEMS_WIDTH_MAX, ITEMS_WIDTH_MIN } from './ItemsPanel.js';

const ITEMS_WIDTH_KEY = 'bezier.items.panel-width';

/** The stored width, clamped to the panel's limits, or the default. */
function readItemsWidth(): number {
  try {
    const raw = window.localStorage.getItem(ITEMS_WIDTH_KEY);
    if (raw !== null) {
      const stored = Number(raw);
      if (Number.isFinite(stored)) {
        return Math.min(ITEMS_WIDTH_MAX, Math.max(ITEMS_WIDTH_MIN, stored));
      }
    }
  } catch {
    // Use the default when storage is unavailable.
  }
  return ITEMS_WIDTH_DEFAULT;
}

export function useItemsWidth() {
  const [itemsWidth, setItemsWidth] = useState(readItemsWidth);
  useEffect(() => {
    // Set on the root so the left rail can make room. The panel is a child of the stage and cannot
    // pass a value up (the theme is set from here for the same reason, see `usePrefs`).
    window.document.documentElement.style.setProperty('--items-width', `${itemsWidth}px`);
    try {
      window.localStorage.setItem(ITEMS_WIDTH_KEY, String(itemsWidth));
    } catch {
      // The resize still works when storage is blocked; only persistence is lost.
    }
  }, [itemsWidth]);
  return [itemsWidth, setItemsWidth] as const;
}
