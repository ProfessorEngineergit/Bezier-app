/**
 * What the docs UI needs from the host app: built-in articles, key bindings from the active keymap,
 * and opening external links.
 */

import { createContext, useContext } from 'react';
import type { DocArticle } from '../format/article.js';

export interface DocsHost {
  /** Built-in articles. */
  articles: readonly DocArticle[];
  /** An action's keys as keycap labels, or null if unbound. */
  keyOf: (action: string) => readonly string[] | null;
  /** Actions with user-facing labels, for the editor's key picker. */
  actions?: readonly { id: string; label: string }[];
  openLink: (url: string) => void;
  /**
   * Places a floating wiki window by the app's floating-window rules: clear of its controls, and
   * snapped to them or an edge when `snap`. Without it windows are only kept on screen.
   */
  place?: (
    rect: { x: number; y: number; width: number; height: number },
    self: Element | null,
    snap: boolean,
  ) => { x: number; y: number; width: number; height: number };
}

const fallback: DocsHost = { articles: [], keyOf: () => null, openLink: () => {} };

export const DocsContext = createContext<DocsHost>(fallback);
export const useDocsHost = (): DocsHost => useContext(DocsContext);
