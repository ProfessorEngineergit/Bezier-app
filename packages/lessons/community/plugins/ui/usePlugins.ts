/**
 * Data for the Plugins page: the catalogue for a query and the installed plugins. Superseded
 * catalogue requests are aborted so results cannot arrive out of order.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Source } from '../../client/sources.js';
import { listPlugins } from '../client/api.js';
import type { PluginEntry } from '../client/catalog.js';
import { type InstalledPlugin, listInstalled } from '../client/installed.js';

export function usePluginCatalog(source: Source | null, q: string, offline: boolean) {
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [next, setNext] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(
    async (cursor: string | undefined) => {
      if (source === null) return;
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setLoading(true);
      setError(null);
      try {
        const page = await listPlugins(
          source,
          { q, offline, ...(cursor === undefined ? {} : { cursor }) },
          current.signal,
        );
        setPlugins((before) =>
          cursor === undefined ? page.plugins : [...before, ...page.plugins],
        );
        setNext(page.next);
      } catch (caught) {
        if (!current.signal.aborted) {
          setError(caught instanceof Error ? caught.message : 'The list could not be loaded.');
        }
      } finally {
        if (controller.current === current) setLoading(false);
      }
    },
    [source, q, offline],
  );

  useEffect(() => {
    setPlugins([]);
    const timer = setTimeout(() => void load(undefined), q === '' ? 0 : 200);
    return () => {
      clearTimeout(timer);
      controller.current?.abort();
    };
  }, [load, q]);

  return {
    plugins,
    loading,
    error,
    hasMore: next !== undefined,
    loadMore: () => void load(next),
    retry: () => void load(undefined),
  };
}

export function useInstalled() {
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const refresh = useCallback(() => {
    listInstalled()
      .then((list) =>
        setInstalled(list.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))),
      )
      .catch((error: unknown) => console.warn('Listing plugins failed.', error));
  }, []);
  useEffect(refresh, [refresh]);
  return { installed, refresh };
}
