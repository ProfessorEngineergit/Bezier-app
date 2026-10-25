/** The start page sidebar width: resizable by its edge, persisted. */

import { useEffect, useState } from 'react';

const DEFAULT = 232;
const MIN = 192;
const MAX = 360;
const STORAGE_KEY = 'bezier.library.sidebar-width';

const clamp = (width: number) => Math.min(MAX, Math.max(MIN, width));

function read(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const stored = Number(raw);
      if (Number.isFinite(stored)) return clamp(stored);
    }
  } catch {
    // Use the brand default when storage is unavailable.
  }
  return DEFAULT;
}

/** The width, and a setter that clamps it. */
export function useSidebarWidth(): [number, (width: number) => void] {
  const [width, setWidth] = useState(read);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      // The resize still works when storage is blocked; only persistence is lost.
    }
  }, [width]);
  return [width, (next) => setWidth(clamp(next))];
}
