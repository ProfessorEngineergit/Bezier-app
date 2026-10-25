/**
 * App-wide wiki state: the open article, whether it is on the Community page or floating, and the
 * ⌘K search. Kept at the root so the article survives collapsing and opening a project.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type DocsSource, listDocs } from '../client/api.js';
import { type Draft, emptyDraft } from '../client/drafts.js';
import type { DocArticle } from '../format/article.js';
import { mergeArticles } from '../format/search.js';
import { DocsContext, type DocsHost } from './context.js';

export type WikiView =
  | { kind: 'list' }
  | { kind: 'article'; id: string }
  | { kind: 'edit'; draft: Draft }
  | { kind: 'history'; id: string }
  | { kind: 'version'; id: string; seq: number };

export interface FloatRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An additional wiki window with its own article and position. */
export interface WikiWindowState {
  id: string;
  view: WikiView;
  rect: FloatRect;
}

export interface Wiki {
  source: DocsSource | null;
  /** Whether writing, editing and history are available (beta and up). Stable is read-only. */
  editable: boolean;
  /** Built-in and store articles merged; the store's version wins for the same id. */
  articles: readonly DocArticle[];
  loading: boolean;
  problem: string | null;
  refresh: () => void;
  view: WikiView;
  show: (view: WikiView) => void;
  open: (id: string) => void;
  write: (draft?: Draft) => void;
  floating: boolean;
  /** Moves the wiki from its page into a floating window. */
  collapse: () => void;
  /** Moves the wiki back to its page; null when no page can be shown. */
  expand: (() => void) | null;
  close: () => void;
  rect: FloatRect;
  setRect: (rect: FloatRect) => void;
  searching: boolean;
  setSearching: (open: boolean) => void;
  /** True while the wiki page is shown; the app's breadcrumb then shows the location. */
  onPage: boolean;
  setOnPage: (shown: boolean) => void;
  /** Registers a function that shows the wiki page; returns an unregister function. */
  offerPage: (show: () => void) => () => void;
  /** Incremented on each page request, so Community switches to its Wiki tab. */
  pageRequest: number;
  /** Additional windows besides the first. */
  windows: readonly WikiWindowState[];
  /** Opens another window with this article, offset from the last one. */
  openWindow: (id: string) => void;
  updateWindow: (id: string, patch: Partial<Omit<WikiWindowState, 'id'>>) => void;
  closeWindow: (id: string) => void;
}

const WikiContext = createContext<Wiki | null>(null);

export function useWiki(): Wiki {
  const wiki = useContext(WikiContext);
  if (wiki === null) throw new Error('useWiki outside WikiProvider');
  return wiki;
}

const RECT_KEY = 'bezier.wiki.float';

function savedRect(): FloatRect {
  const width = Math.min(520, window.innerWidth - 32);
  // Left of the right-hand rail and below the bar, clear of the app's controls.
  const fallback = {
    x: Math.max(8, window.innerWidth - width - 72),
    y: 64,
    width,
    height: Math.min(720, window.innerHeight - 120),
  };
  try {
    const saved = JSON.parse(localStorage.getItem(RECT_KEY) ?? 'null') as FloatRect | null;
    if (saved === null) return fallback;
    // Clamp to the current window, which may be smaller than before.
    const w = Math.min(saved.width, window.innerWidth - 16);
    const h = Math.min(saved.height, window.innerHeight - 16);
    return {
      width: w,
      height: h,
      x: Math.min(Math.max(8, saved.x), window.innerWidth - w - 8),
      y: Math.min(Math.max(8, saved.y), window.innerHeight - h - 8),
    };
  } catch {
    return fallback;
  }
}

/** Loads all store articles; a wiki is small enough to hold and search in memory. */
function useStoreArticles(source: DocsSource | null, round: number) {
  const [articles, setArticles] = useState<readonly DocArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` triggers a reload
  useEffect(() => {
    if (source === null) {
      setArticles([]);
      setProblem(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      const all: DocArticle[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 40; page += 1) {
        const got = await listDocs(
          source,
          cursor === undefined ? {} : { cursor },
          controller.signal,
        );
        all.push(...got.articles);
        cursor = got.next;
        if (cursor === undefined) break;
      }
      setArticles(all);
      setProblem(null);
    })()
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setProblem(error instanceof Error ? error.message : 'The store did not answer.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [source, round]);
  return { articles, loading, problem };
}

export function WikiProvider({
  host,
  source,
  editable,
  children,
}: {
  host: DocsHost;
  editable: boolean;
  /** The community store's wiki, or null while Community is off. */
  source: DocsSource | null;
  children: ReactNode;
}) {
  const [round, setRound] = useState(0);
  const store = useStoreArticles(source, round);
  const [view, setView] = useState<WikiView>({ kind: 'list' });
  const [floating, setFloating] = useState(false);
  const [rect, setRectState] = useState<FloatRect>(savedRect);
  const [searching, setSearching] = useState(false);
  const page = useRef<(() => void) | null>(null);
  const [pageOffered, setPageOffered] = useState(false);
  const [pageRequest, setPageRequest] = useState(0);
  const [onPage, setOnPage] = useState(false);
  const [windows, setWindows] = useState<readonly WikiWindowState[]>([]);
  const showPage = useCallback(() => {
    setPageRequest((n) => n + 1);
    page.current?.();
  }, []);

  const articles = useMemo(
    () => mergeArticles(host.articles, store.articles),
    [host.articles, store.articles],
  );

  const setRect = useCallback((next: FloatRect) => {
    setRectState(next);
    try {
      localStorage.setItem(RECT_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable; the window starts at its default position next time.
    }
  }, []);

  const offerPage = useCallback((show: () => void) => {
    page.current = show;
    setPageOffered(true);
    return () => {
      if (page.current !== show) return;
      page.current = null;
      setPageOffered(false);
    };
  }, []);

  // ⌘K / Ctrl+K opens the wiki search anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'k')
        return;
      event.preventDefault();
      event.stopPropagation();
      setSearching((open) => !open);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const wiki: Wiki = {
    source,
    editable,
    articles,
    loading: store.loading,
    problem: store.problem,
    refresh: () => setRound((n) => n + 1),
    view,
    show: setView,
    open: (id) => {
      setView({ kind: 'article', id });
      // Show on the page when available, otherwise floating.
      if (!floating && page.current !== null) showPage();
      else setFloating(true);
    },
    write: (draft) => setView({ kind: 'edit', draft: draft ?? emptyDraft() }),
    floating,
    collapse: () => setFloating(true),
    expand: pageOffered
      ? () => {
          setFloating(false);
          showPage();
        }
      : null,
    close: () => setFloating(false),
    rect,
    setRect,
    searching,
    setSearching,
    onPage,
    setOnPage,
    offerPage,
    pageRequest,
    windows,
    openWindow: (id) =>
      setWindows((list) => {
        const last = list[list.length - 1]?.rect ?? rect;
        const step = 28;
        return [
          ...list,
          {
            id: `wiki-window-${Date.now().toString(36)}-${list.length}`,
            view: { kind: 'article', id },
            rect: {
              ...last,
              x: Math.max(8, last.x - step),
              y: Math.min(window.innerHeight - last.height - 8, last.y + step),
            },
          },
        ];
      }),
    updateWindow: (id, patch) =>
      setWindows((list) => list.map((w) => (w.id === id ? { ...w, ...patch } : w))),
    closeWindow: (id) => setWindows((list) => list.filter((w) => w.id !== id)),
  };

  return (
    <DocsContext.Provider value={host}>
      <WikiContext.Provider value={wiki}>{children}</WikiContext.Provider>
    </DocsContext.Provider>
  );
}

/**
 * Scopes the wiki context to an extra window: its own article and position, and closing closes
 * only that window. Articles, search and store are shared.
 */
export function WikiWindowScope({
  state,
  children,
}: {
  state: WikiWindowState;
  children: ReactNode;
}) {
  const wiki = useWiki();
  const scoped: Wiki = {
    ...wiki,
    view: state.view,
    show: (view) => wiki.updateWindow(state.id, { view }),
    open: (id) => wiki.updateWindow(state.id, { view: { kind: 'article', id } }),
    write: (draft) =>
      wiki.updateWindow(state.id, { view: { kind: 'edit', draft: draft ?? emptyDraft() } }),
    floating: true,
    expand: null,
    close: () => wiki.closeWindow(state.id),
    rect: state.rect,
    setRect: (rect) => wiki.updateWindow(state.id, { rect }),
  };
  return <WikiContext.Provider value={scoped}>{children}</WikiContext.Provider>;
}
