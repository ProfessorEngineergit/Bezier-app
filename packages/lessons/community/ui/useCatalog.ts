/**
 * A source's catalogue for a query, paginated. Typing is debounced and superseded requests are
 * aborted, so results always match the current query.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LessonLevel } from '../../src/format/manifest.js';
import type { CatalogEntry } from '../client/catalog.js';
import { listCommunity } from '../client/client.js';
import type { Source } from '../client/sources.js';

export interface Catalog {
  lessons: CatalogEntry[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

const DEBOUNCE_MS = 200;

export function useCatalog(source: Source | null, q: string, level: LessonLevel | null): Catalog {
  const [lessons, setLessons] = useState<CatalogEntry[]>([]);
  const [next, setNext] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (cursor: string | undefined, append: boolean) => {
      if (source === null) return;
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setLoading(true);
      setError(null);
      try {
        const page = await listCommunity(
          source,
          {
            q,
            ...(level === null ? {} : { level }),
            ...(cursor === undefined ? {} : { cursor }),
          },
          current.signal,
        );
        setLessons((before) => (append ? [...before, ...page.lessons] : page.lessons));
        setNext(page.next);
      } catch (caught) {
        if (current.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : 'The list could not be loaded.');
      } finally {
        if (controller.current === current) setLoading(false);
      }
    },
    [source, q, level],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger
  useEffect(() => {
    setLessons([]);
    setNext(undefined);
    if (source === null) return;
    const timer = setTimeout(() => void fetchPage(undefined, false), q === '' ? 0 : DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.current?.abort();
    };
  }, [fetchPage, attempt]);

  return {
    lessons,
    loading,
    error,
    hasMore: next !== undefined,
    loadMore: () => {
      if (next !== undefined && !loading) void fetchPage(next, true);
    },
    retry: () => setAttempt((n) => n + 1),
  };
}
