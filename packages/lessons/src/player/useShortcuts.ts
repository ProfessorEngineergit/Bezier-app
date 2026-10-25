import { useEffect } from 'react';

/**
 * Window-level player shortcuts while `active`. Ignored while the user is typing or holding a
 * modifier, so browser and editor shortcuts still work.
 */
export function useShortcuts(
  active: boolean,
  handle: (key: string, event: KeyboardEvent) => boolean,
) {
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"]') !== null
      ) {
        return;
      }
      if (handle(event.key, event)) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, handle]);
}

export const SHORTCUTS: { keys: string[]; does: string }[] = [
  { keys: ['Space', 'K'], does: 'Play or pause' },
  { keys: ['J', 'L'], does: 'Back or forward 10 seconds' },
  { keys: ['←', '→'], does: 'Back or forward 5 seconds' },
  { keys: ['↑', '↓'], does: 'Previous or next chapter' },
  { keys: ['P', 'N'], does: 'Previous or next chapter' },
  { keys: ['0–9'], does: 'Jump to a tenth of the lesson' },
  { keys: ['Home', 'End'], does: 'Start or end' },
  { keys: ['R'], does: 'Repeat this chapter' },
  { keys: ['M'], does: 'Mute' },
  { keys: ['F'], does: 'Full screen' },
  { keys: ['?'], does: 'This list' },
];
