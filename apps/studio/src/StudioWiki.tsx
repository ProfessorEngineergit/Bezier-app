/**
 * The app-wide wiki, given what only the app knows: its articles, the active keymap and its
 * actions, and how to open external links. Mounted at the root so ⌘K works everywhere and a
 * collapsed article stays over an open project.
 */

import { type DocsHost, useChannel, WikiRoot } from '@bezier/lessons';
import { activeKeymap, KEY_ACTIONS, shortcutCaps } from '@bezier/ui';
import { type ReactNode, useMemo } from 'react';
import { placeOnScreen } from './floating-place.js';
import { articlesFor } from './help/index.js';
import { openExternal } from './open-external.js';

export function StudioWiki({ children }: { children: ReactNode }) {
  const channel = useChannel();
  const host = useMemo<DocsHost>(
    () => ({
      articles: articlesFor(channel),
      // Read when an article renders, since the user may have rebound keys.
      keyOf: (action) => {
        const shortcut = activeKeymap().get(action);
        return shortcut === undefined || shortcut === '' ? null : shortcutCaps(shortcut);
      },
      actions: KEY_ACTIONS.map((action) => ({
        id: action.id,
        label: `${action.label} (${action.group})`,
      })),
      openLink: openExternal,
      // The wiki's windows follow the app's floating panel placement rules.
      place: placeOnScreen,
    }),
    [channel],
  );
  return <WikiRoot host={host}>{children}</WikiRoot>;
}
