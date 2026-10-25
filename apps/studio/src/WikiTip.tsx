/**
 * A dismissible tip at the top of the start page: the wiki shortcut. Shows Command on a Mac,
 * Control elsewhere (the wiki accepts both everywhere, so a Super key, which browsers report as
 * Command, works too).
 */

import { CrossIcon, isApple } from '@bezier/ui';
import { useState } from 'react';

const KEY = 'bezier.tip.wiki';

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === 'dismissed';
  } catch {
    return false;
  }
}

export function WikiTip({ onOpen }: { onOpen: () => void }) {
  const [shown, setShown] = useState(() => !dismissed());
  if (!shown) return null;
  const mac = isApple();
  return (
    <aside aria-label="Tip" className="wiki-tip">
      <p>
        Press{' '}
        <span className="prefs-keys">
          <kbd>{mac ? '⌘' : 'Ctrl'}</kbd>
          <kbd>K</kbd>
        </span>{' '}
        anywhere in Bezier to open the wiki.{' '}
        <button className="wiki-tip__link" onClick={onOpen} type="button">
          Open it now
        </button>
      </p>
      <button
        aria-label="Close this tip. It will not come back."
        className="wiki-tip__close"
        onClick={() => {
          setShown(false);
          try {
            localStorage.setItem(KEY, 'dismissed');
          } catch {
            // Storage unavailable: it shows again next time, the lesser harm.
          }
        }}
        type="button"
      >
        <CrossIcon />
      </button>
    </aside>
  );
}
