/**
 * Wiki editor menus, modelled on Outline: a formatting bar over selected text, a "/" block menu at
 * the start of a line, and pickers for links (article or web) and action keys. All are anchored to
 * the text and keyboard accessible.
 */

import type { EditorView } from 'prosemirror-view';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { DocArticle } from '../format/article.js';
import { safeHref } from '../format/markdown.js';
import { findArticles } from '../format/search.js';

export interface Anchor {
  left: number;
  top: number;
  bottom: number;
}

/** Positions a menu below or above a text position, within the editor frame. */
export function anchorAt(view: EditorView, pos: number): Anchor | null {
  try {
    const at = view.coordsAtPos(pos);
    const frame = view.dom.closest('.wiki-editor')?.getBoundingClientRect();
    if (frame === undefined) return null;
    return { left: at.left - frame.left, top: at.top - frame.top, bottom: at.bottom - frame.top };
  } catch {
    return null;
  }
}

export interface BubbleItem {
  id: string;
  label: ReactNode;
  title: string;
  on: boolean;
  run: () => void;
}

export function BubbleBar({ anchor, items }: { anchor: Anchor; items: readonly BubbleItem[] }) {
  return (
    <div
      className="wiki-bubble"
      // Keep the text selection when a button is pressed.
      onMouseDown={(event) => event.preventDefault()}
      role="toolbar"
      aria-label="Format"
      style={{ left: anchor.left, top: anchor.top }}
    >
      {items.map((item) => (
        <button
          aria-pressed={item.on}
          className="wiki-bubble__button"
          key={item.id}
          onClick={item.run}
          title={item.title}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export interface SlashItem {
  id: string;
  label: string;
  hint: string;
  words: string;
}

export const SLASH_ITEMS: readonly SlashItem[] = [
  { id: 'h2', label: 'Heading', hint: '##', words: 'heading title section h2' },
  { id: 'h3', label: 'Subheading', hint: '###', words: 'subheading heading h3' },
  { id: 'ordered', label: 'Steps', hint: '1.', words: 'steps numbered ordered list' },
  { id: 'bullets', label: 'List', hint: '-', words: 'list bullets unordered' },
  { id: 'note', label: 'Note', hint: '>', words: 'note tip callout quote' },
  { id: 'code', label: 'Code', hint: '```', words: 'code block' },
  { id: 'picture', label: 'Picture', hint: 'File', words: 'picture image screenshot photo upload' },
  { id: 'key', label: 'Key of an action', hint: '⌘', words: 'key shortcut keyboard action' },
  { id: 'link', label: 'Link to an article', hint: '↗', words: 'link article page reference' },
];

export function slashMatches(query: string): readonly SlashItem[] {
  const q = query.toLowerCase();
  return SLASH_ITEMS.filter(
    (item) => q === '' || item.label.toLowerCase().startsWith(q) || item.words.includes(q),
  );
}

export function SlashMenu({
  anchor,
  items,
  active,
  onPick,
}: {
  anchor: Anchor;
  items: readonly SlashItem[];
  active: number;
  onPick: (item: SlashItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div
      aria-label="Insert"
      className="wiki-menu"
      onMouseDown={(event) => event.preventDefault()}
      role="listbox"
      style={{ left: anchor.left, top: anchor.bottom + 6 }}
    >
      {items.map((item, index) => (
        <button
          aria-selected={index === active}
          className="wiki-menu__item"
          key={item.id}
          onClick={() => onPick(item)}
          role="option"
          type="button"
        >
          <span>{item.label}</span>
          <kbd>{item.hint}</kbd>
        </button>
      ))}
    </div>
  );
}

/** A type-to-filter picker for link targets or actions. */
function Picker<T>({
  anchor,
  placeholder,
  label,
  items,
  describe,
  extra,
  onPick,
  onClose,
}: {
  anchor: Anchor;
  placeholder: string;
  label: string;
  items: (query: string) => readonly T[];
  describe: (item: T) => { key: string; title: string; detail: string };
  /** An extra option derived from the query itself, such as a web address. */
  extra?: (query: string) => { label: string; run: () => void } | null;
  onPick: (item: T) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => items(query).slice(0, 8), [items, query]);
  const own = extra?.(query) ?? null;
  const count = shown.length + (own === null ? 0 : 1);
  useEffect(() => field.current?.focus(), []);
  const pick = (index: number) => {
    if (own !== null && index === 0) return own.run();
    const item = shown[index - (own === null ? 0 : 1)];
    if (item !== undefined) onPick(item);
  };
  return (
    <div
      className="wiki-menu wiki-picker"
      role="listbox"
      aria-label={label}
      style={{ left: anchor.left, top: anchor.bottom + 6 }}
    >
      <input
        aria-label={label}
        className="wiki-picker__field"
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          else if (event.key === 'ArrowDown') setActive((n) => Math.min(count - 1, n + 1));
          else if (event.key === 'ArrowUp') setActive((n) => Math.max(0, n - 1));
          else if (event.key === 'Enter') pick(active);
          else return;
          event.preventDefault();
        }}
        placeholder={placeholder}
        ref={field}
        value={query}
      />
      {own !== null && (
        <button
          aria-selected={active === 0}
          className="wiki-menu__item"
          onClick={own.run}
          role="option"
          type="button"
        >
          <span>{own.label}</span>
        </button>
      )}
      {shown.map((item, index) => {
        const { key, title, detail } = describe(item);
        const at = index + (own === null ? 0 : 1);
        return (
          <button
            aria-selected={active === at}
            className="wiki-menu__item"
            key={key}
            onClick={() => onPick(item)}
            role="option"
            type="button"
          >
            <span>{title}</span>
            <small>{detail}</small>
          </button>
        );
      })}
      {count === 0 && <p className="wiki-picker__none">Nothing matches.</p>}
    </div>
  );
}

export function LinkPicker({
  anchor,
  articles,
  onLink,
  onClose,
}: {
  anchor: Anchor;
  articles: readonly DocArticle[];
  onLink: (href: string, title: string) => void;
  onClose: () => void;
}) {
  return (
    <Picker
      anchor={anchor}
      describe={(article: DocArticle) => ({
        key: article.id,
        title: article.title,
        detail: article.area,
      })}
      extra={(query) => {
        const web = safeHref(/^https?:\/\//.test(query.trim()) ? query.trim() : '');
        return web === null ? null : { label: `Link to ${web}`, run: () => onLink(web, web) };
      }}
      items={(query) =>
        findArticles(query.split(/\s+/).filter(Boolean), articles) as readonly DocArticle[]
      }
      label="Link to"
      onClose={onClose}
      onPick={(article) => onLink(`doc:${article.id}`, article.title)}
      placeholder="Search articles, or paste a web address"
    />
  );
}

export interface ActionChoice {
  id: string;
  label: string;
}

export function KeyPicker({
  anchor,
  actions,
  onPick,
  onClose,
}: {
  anchor: Anchor;
  actions: readonly ActionChoice[];
  onPick: (action: string) => void;
  onClose: () => void;
}) {
  return (
    <Picker
      anchor={anchor}
      describe={(action: ActionChoice) => ({
        key: action.id,
        title: action.label,
        detail: action.id,
      })}
      items={(query) => {
        const q = query.toLowerCase();
        return actions.filter(
          (action) => action.label.toLowerCase().includes(q) || action.id.includes(q),
        );
      }}
      label="Which action"
      onClose={onClose}
      onPick={(action) => onPick(action.id)}
      placeholder="Which command: Extrude, Undo, Line…"
    />
  );
}
