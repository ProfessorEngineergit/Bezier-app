/**
 * The app-wide wiki root, mounted once with the `DocsHost` and the community store. Holds the wiki
 * state and renders the floating window and the ⌘K search.
 */

import { type ReactNode, useMemo } from 'react';
import { reaches } from '../../client/channel.js';
import { docsOf } from '../../client/store.js';
import { useCommunityStore } from '../../ui/useStore.js';
import type { DocsHost } from './context.js';
import { WikiOverlays } from './WikiWindow.js';
import { WikiProvider } from './wiki-state.js';
import './wiki.css';

import { useChannel } from '../../ui/useChannel.js';

export function WikiRoot({ host, children }: { host: DocsHost; children: ReactNode }) {
  const store = useCommunityStore();
  const source = useMemo(
    () => (store.on ? { url: docsOf(store).url, name: store.name } : null),
    [store],
  );
  return (
    <WikiProvider editable={reaches(useChannel(), 'alpha')} host={host} source={source}>
      {children}
      <WikiOverlays />
    </WikiProvider>
  );
}
