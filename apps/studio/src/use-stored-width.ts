/**
 * A side panel's width in pixels, kept in local storage like the library sidebar's: a per-machine
 * habit, not document state.
 */

import { useEffect, useState } from 'react';

export interface WidthLimits {
  key: string;
  initial: number;
  min: number;
  max: number;
}

/** The stored width, clamped to the panel's limits, or the default. */
function readWidth({ key, initial, min, max }: WidthLimits): number {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) {
      const stored = Number(raw);
      if (Number.isFinite(stored)) return Math.min(max, Math.max(min, stored));
    }
  } catch {
    // Use the default when storage is unavailable.
  }
  return initial;
}

export function useStoredWidth(limits: WidthLimits) {
  const [width, setWidth] = useState(() => readWidth(limits));
  useEffect(() => {
    try {
      window.localStorage.setItem(limits.key, String(width));
    } catch {
      // The resize still works when storage is blocked; only persistence is lost.
    }
  }, [limits.key, width]);
  return [width, setWidth] as const;
}
