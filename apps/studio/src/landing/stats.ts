/**
 * Numbers on the landing page. App numbers are counted from the build. The download count comes
 * from an address published at launch; until then no figure is shown.
 */

import { listFeatures } from '@bezier/core';
import { KEYMAP_PRESETS } from '@bezier/ui';
import { useEffect, useState } from 'react';
import { ARTICLES } from '../help/index.js';
import { WORKSPACES } from '../workspaces/WorkspaceModes.js';

/** Where the download count is read from: `{ "downloads": 1234 }`. Empty until the launch. */
export const DOWNLOADS_URL = '';

export const REPOSITORY_URL = 'https://github.com/ProfessorEngineergit/bezier';

export interface Fact {
  id: string;
  value: string;
  label: string;
}

/** Counts of what the app contains. */
export function facts(): readonly Fact[] {
  return [
    { id: 'steps', value: String(listFeatures().length), label: 'kinds of step in a history' },
    { id: 'workspaces', value: String(WORKSPACES.length), label: 'workspaces on one model' },
    {
      id: 'keys',
      value: String(KEYMAP_PRESETS.length),
      label: 'sets of keys, from the CAD you know',
    },
    { id: 'wiki', value: String(ARTICLES.length), label: 'wiki articles' },
  ];
}

/** The download count, or null when there is none to show. */
export function useDownloads(url: string = DOWNLOADS_URL): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (url === '') return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { downloads?: unknown } | null) => {
        if (typeof body?.downloads === 'number' && Number.isFinite(body.downloads))
          setCount(Math.max(0, Math.round(body.downloads)));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [url]);
  return count;
}
