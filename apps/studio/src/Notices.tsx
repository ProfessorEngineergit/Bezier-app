import { type Notice, useNotificationSource } from '@bezier/ui';
import { useEffect, useMemo, useState } from 'react';
import type { Said } from './said.js';

/**
 * Messages passed to the shell's notices (`Toasts.tsx`). Each id comes from its text, not its list
 * index, which would shift when an earlier notice leaves and replay the notice.
 */

export interface NoticesProps {
  notices: readonly Said[];
  onDismiss: (notice: Said) => void;
}

/** Storage key for notices already shown once on this device. */
const SEEN_KEY = 'bezier.notices.seen';

function seen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function remember(keys: Iterable<string>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...seen(), ...keys])]));
  } catch {
    // Storage unavailable: the notice shows again next time, the lesser harm.
  }
}

export function Notices({ notices, onDismiss }: NoticesProps) {
  // Notices seen before this start, read once; otherwise a once-only notice would vanish as soon as
  // it was recorded.
  const [before] = useState(seen);
  const shown = useMemo(
    () => notices.filter((said) => said.once === undefined || !before.has(said.once)),
    [before, notices],
  );

  // Record a notice once shown, so a reload does not repeat it.
  useEffect(() => {
    remember(shown.flatMap((said) => (said.once === undefined ? [] : [said.once])));
  }, [shown]);

  const centred = useMemo<readonly Notice[]>(
    () =>
      shown.map((said) => ({
        id: `said:${said.title}\n${said.detail ?? ''}`,
        title: said.title,
        ...(said.detail === undefined ? {} : { detail: said.detail }),
        ...(said.tone === undefined ? {} : { tone: said.tone }),
        ...(said.sticky === undefined ? {} : { sticky: said.sticky }),
      })),
    [shown],
  );

  useNotificationSource(centred, (id) => {
    const said = shown.find((each) => `said:${each.title}\n${each.detail ?? ''}` === id);
    if (said !== undefined) onDismiss(said);
  });

  return null;
}
