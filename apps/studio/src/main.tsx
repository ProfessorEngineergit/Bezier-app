import { setInviteKey } from '@bezier/lessons';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { CollabProvider } from './collab/CollabProvider.js';
import { FirstRunFilm } from './intro/FirstRunFilm.js';
import { mountIsland } from './island/mount.js';
import { learnMachineMemory } from './machine-memory.js';
import { NibHost } from './NibHost.js';
import { installNativeFeel } from './native-feel.js';
import { installActivityLog } from './report/activity-log.js';
import { installLogBuffer } from './report/log-buffer.js';
import { ReportHost } from './report/ReportHost.js';
import { StudioWiki } from './StudioWiki.js';
import './styles.css';
import './dialogs.css';
import './menu.css';
import './library.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('index.html is missing #root');
}

// Browser tests sign invitation codes with their own key. Only the development server accepts
// it; a release build has only the owner's key.
if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true) {
  const key = (window as { __bezierInviteKey?: unknown }).__bezierInviteKey;
  if (typeof key === 'string') setInviteKey(key);
}

// Before the first paint, so no context menu or drag is available while the app mounts.
installNativeFeel();
// Before anything can fail, so a problem report includes the start.
installLogBuffer();
installActivityLog();
// Probe machine memory early, before any import; the page cannot read it directly.
void learnMachineMemory();

// The macOS desktop build draws the window buttons over the page's top-left corner (Tauri's
// "Overlay" title bar). The attribute lets surfaces there leave room. Windows, Linux and the
// browser build have no such overlay.
if ('__TAURI_INTERNALS__' in window) {
  document.documentElement.dataset.shell = 'desktop';
  if (/Mac/i.test(navigator.platform || navigator.userAgent)) {
    document.documentElement.dataset.platform = 'mac';
  }
}

// Nib in the title bar, mounted first in his own root, so he can report when the app's root
// crashes (island/IslandHost.tsx).
mountIsland();

createRoot(root).render(
  <StrictMode>
    <CollabProvider>
      <StudioWiki>
        <NibHost>
          <App />
          <FirstRunFilm />
          <ReportHost />
        </NibHost>
      </StudioWiki>
    </CollabProvider>
  </StrictMode>,
);
