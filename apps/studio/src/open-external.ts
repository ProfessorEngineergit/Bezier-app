/**
 * Opens a URL outside the app: the system browser from the desktop app, a new tab in a browser. In
 * the desktop app a plain link would replace the app with the page.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';

export function openExternal(url: string): void {
  if (isTauri()) {
    void invoke('open_external', { url }).catch(() => undefined);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
