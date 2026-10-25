/**
 * Mounts Nib in the title bar in his own root, a sibling of `#root`, so an app crash leaves it
 * standing (`IslandHost.tsx`). The node is created here rather than in `index.html` so pages
 * without it (a test harness, an old cached shell) still get him.
 */

import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { IslandHost } from './IslandHost.js';

export function mountIsland(): void {
  if (document.getElementById('nib-island') !== null) return;
  const node = document.createElement('div');
  node.id = 'nib-island';
  document.body.append(node);
  createRoot(node).render(createElement(StrictMode, null, createElement(IslandHost)));
}
