/**
 * A React hook owning one ProseMirror view, created once. Figures re-render when pictures change,
 * and `tick` updates the menus. The Markdown (format/markdown.ts) remains the source of truth.
 */

import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { fromMarkdown, toMarkdown } from './convert.js';
import { schema } from './schema.js';
import { plugins } from './setup.js';
import { FigureView, KeyView, type PictureHost } from './views.js';

export interface Editing {
  view: EditorView | null;
  /** Bumped on every document or selection change; the menus depend on it. */
  tick: number;
  /** Replaces the whole document from Markdown. */
  setMarkdown: (markdown: string) => void;
  /** Inserts a picture at the cursor or at `at`. */
  insertFigure: (key: string, at?: number) => void;
  focus: () => void;
}

export function useProseMirror({
  mount,
  markdown,
  onChange,
  pictures,
  keyOf,
  onFiles,
}: {
  mount: RefObject<HTMLDivElement | null>;
  /** The initial article; later changes go through `setMarkdown`. */
  markdown: string;
  onChange: (markdown: string) => void;
  pictures: PictureHost;
  keyOf: (action: string) => readonly string[] | null;
  /** Called with pictures dropped or pasted into the text, and their position. */
  onFiles: (files: readonly File[], at: number) => void;
}): Editing {
  const [view, setView] = useState<EditorView | null>(null);
  const [tick, setTick] = useState(0);
  const figures = useRef(new Set<FigureView>());
  // The view is created once, so it reads the latest callbacks through a ref.
  const latest = useRef({ onChange, pictures, keyOf, onFiles });
  latest.current = { onChange, pictures, keyOf, onFiles };

  // biome-ignore lint/correctness/useExhaustiveDependencies: created once from initial `markdown`
  useEffect(() => {
    const place = mount.current;
    if (place === null) return;
    const host: PictureHost = {
      picture: (key) => latest.current.pictures.picture(key),
      setAlt: (key, alt) => latest.current.pictures.setAlt(key, alt),
      editArrows: (key) => latest.current.pictures.editArrows(key),
      replace: (key) => latest.current.pictures.replace(key),
    };
    const editor: EditorView = new EditorView(place, {
      state: EditorState.create({ doc: fromMarkdown(markdown), plugins: plugins() }),
      attributes: { class: 'doc-body wiki-prose', spellcheck: 'true', 'aria-label': 'Article' },
      nodeViews: {
        figure: (node, v, getPos) => {
          const shown = new FigureView(node, v, getPos, host);
          figures.current.add(shown);
          return Object.assign(shown, {
            destroy: () => figures.current.delete(shown),
          });
        },
        key: (node) => new KeyView(node, (action) => latest.current.keyOf(action)),
      },
      dispatchTransaction(tr) {
        const next = editor.state.apply(tr);
        editor.updateState(next);
        if (tr.docChanged && tr.getMeta('from-markdown') !== true)
          latest.current.onChange(toMarkdown(next.doc));
        setTick((n) => n + 1);
      },
      handleDOMEvents: {
        focus: () => {
          setTick((n) => n + 1);
          return false;
        },
        blur: () => {
          setTick((n) => n + 1);
          return false;
        },
      },
      handleDrop(v, event) {
        const files = [...(event.dataTransfer?.files ?? [])].filter((file) =>
          file.type.startsWith('image/'),
        );
        if (files.length === 0) return false;
        event.preventDefault();
        const at = v.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        latest.current.onFiles(files, at ?? v.state.selection.from);
        return true;
      },
      handlePaste(v, event) {
        const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
          file.type.startsWith('image/'),
        );
        if (files.length === 0) return false;
        latest.current.onFiles(files, v.state.selection.from);
        return true;
      },
    });
    setView(editor);
    return () => {
      editor.destroy();
      setView(null);
    };
  }, [mount]);

  // Re-render figures after every render, since pictures, arrows or captions may have changed.
  useEffect(() => {
    for (const figure of figures.current) figure.render();
  });

  return {
    view,
    tick,
    setMarkdown: (text) => {
      if (view === null) return;
      const doc = fromMarkdown(text);
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
      tr.setMeta('from-markdown', true);
      view.dispatch(tr);
    },
    insertFigure: (key, at) => {
      if (view === null) return;
      const figure = schema.nodes.figure.create({ key });
      const { state } = view;
      // Figures are blocks, so insert after the top-level block containing the position.
      const $at = state.doc.resolve(Math.min(at ?? state.selection.from, state.doc.content.size));
      const after = $at.depth === 0 ? $at.pos : $at.after(1);
      const tr = state.tr.insert(after, figure);
      tr.setSelection(NodeSelection.create(tr.doc, after));
      view.dispatch(tr.scrollIntoView());
      view.focus();
    },
    focus: () => {
      if (view === null) return;
      view.focus();
      if (view.state.selection.empty && view.state.selection.from === 0)
        view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)));
    },
  };
}
