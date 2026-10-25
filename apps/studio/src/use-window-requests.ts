/**
 * Requests from outside the app's screens: Nib opening the project a background load finished in,
 * and the window closing. Closing with work in progress (a load, an export) asks first, through Nib
 * in the desktop app (`askQuestion`) or the browser's leave-page prompt; otherwise it closes at
 * once.
 */

import { isTauri } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { askQuestion } from './ask-question.js';
import { OPEN_PROJECT_EVENT, workUnderWay } from './island/island-feed.js';

export function useWindowRequests(openDocument: (id: string) => void): void {
  // Nib's "Open the project": the one a model finished loading into.
  useEffect(() => {
    const open = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      // Also for the last open session: after leaving for the start page it is still in memory and
      // reopens as it was (`use-dashboard.ts`).
      if (typeof id === 'string') openDocument(id);
    };
    window.addEventListener(OPEN_PROJECT_EVENT, open);
    return () => window.removeEventListener(OPEN_PROJECT_EVENT, open);
  }, [openDocument]);

  useEffect(() => {
    if (!isTauri()) {
      const leave = (event: BeforeUnloadEvent) => {
        if (workUnderWay()) event.preventDefault();
      };
      window.addEventListener('beforeunload', leave);
      return () => window.removeEventListener('beforeunload', leave);
    }
    let gone = false;
    let stop: (() => void) | undefined;
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const window = getCurrentWindow();
      let asking = false;
      const unlisten = await window.onCloseRequested(async (event) => {
        if (!workUnderWay()) return;
        event.preventDefault();
        if (asking) return;
        asking = true;
        const close = await askQuestion({
          title: 'Work is still under way',
          message: 'Close Bezier anyway? What is still loading or being exported will be lost.',
          yes: 'Close anyway',
          no: 'Keep working',
        });
        asking = false;
        if (close) await window.destroy();
      });
      if (gone) unlisten();
      else stop = unlisten;
    });
    return () => {
      gone = true;
      stop?.();
    };
  }, []);
}
