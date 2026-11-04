/** Width of the Items panel, published for the left rail to make room. */

import { useEffect } from 'react';
import { ITEMS_WIDTH_DEFAULT, ITEMS_WIDTH_MAX, ITEMS_WIDTH_MIN } from './ItemsPanel.js';
import { useStoredWidth } from './use-stored-width.js';

const LIMITS = {
  key: 'bezier.items.panel-width',
  initial: ITEMS_WIDTH_DEFAULT,
  min: ITEMS_WIDTH_MIN,
  max: ITEMS_WIDTH_MAX,
};

export function useItemsWidth() {
  const [itemsWidth, setItemsWidth] = useStoredWidth(LIMITS);
  useEffect(() => {
    // Set on the root so the left rail can make room. The panel is a child of the stage and cannot
    // pass a value up (the theme is set from here for the same reason, see `usePrefs`).
    window.document.documentElement.style.setProperty('--items-width', `${itemsWidth}px`);
  }, [itemsWidth]);
  return [itemsWidth, setItemsWidth] as const;
}
