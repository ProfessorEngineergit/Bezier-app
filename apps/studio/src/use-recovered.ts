/**
 * Notice shown once after the desktop shell reloaded the page because its process died
 * (`apps/desktop/src-tauri/src/crash.rs`, Windows). Without it the restart looks like a lost
 * project.
 */

import { useEffect } from 'react';
import type { Said } from './said.js';

export function useRecoveredNotice(say: (message: Said) => void): void {
  useEffect(() => {
    if (window.location.hash !== '#recovered') return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    say({
      title: 'Bezier stopped unexpectedly and was opened again.',
      detail: 'Every change is saved as it is made: open your project from the library.',
      sticky: true,
    });
  }, [say]);
}
