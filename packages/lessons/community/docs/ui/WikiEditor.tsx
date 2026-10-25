/**
 * The wiki editor: a WYSIWYG view with an optional synced Markdown pane ("Show Markdown").
 * Pictures are added by drop, paste or the "/" menu and get captions and arrows in place. Drafts
 * are saved locally while typing; publishing makes the change live immediately.
 */

import { TextSelection } from 'prosemirror-state';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type DocsSource, sendArticle, whoAmI } from '../client/api.js';
import { type Draft, deleteDraft, idFromTitle, outgoing, saveDraft } from '../client/drafts.js';
import { preparePicture } from '../client/picture.js';
import { savedToken, saveToken } from '../client/token.js';
import { isMarkOn, marks, nodes, setBlock, toggleMark } from '../editor/setup.js';
import { useProseMirror } from '../editor/use-prosemirror.js';
import {
  DOC_AREAS,
  type DocArea,
  type DocArticle,
  IMAGE_KEY_PATTERN,
  LIMITS,
  problemWith,
} from '../format/article.js';
import { ArrowEditor } from './ArrowEditor.js';
import { useDocsHost } from './context.js';
import {
  type Anchor,
  anchorAt,
  BubbleBar,
  KeyPicker,
  LinkPicker,
  type SlashItem,
  SlashMenu,
  slashMatches,
} from './EditorMenus.js';
import { useObjectUrls } from './useObjectUrls.js';

function nameFor(taken: readonly string[], file: string): string {
  const base =
    file
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'picture';
  for (let n = 1; ; n += 1) {
    const name = n === 1 ? base : `${base}-${n}`;
    if (!taken.includes(name) && IMAGE_KEY_PATTERN.test(name)) return name;
  }
}

/** Keeps only the pictures the body references. */
const shown = (draft: Draft): Draft => ({
  ...draft,
  images: Object.fromEntries(
    Object.entries(draft.images).filter(([key]) => draft.body.includes(`(image:${key})`)),
  ),
});

type Picking =
  | { kind: 'link'; anchor: Anchor; insert: boolean }
  | { kind: 'key'; anchor: Anchor }
  | null;

export function WikiEditor({
  draft: start,
  source,
  articles,
  existing,
  onDone,
  onCancel,
}: {
  draft: Draft;
  /** The store's wiki, or null when Community is off. */
  source: DocsSource | null;
  articles: readonly DocArticle[];
  existing: ReadonlySet<string>;
  /** Called with the published id, or null when only saved locally. */
  onDone: (published: string | null) => void;
  onCancel: () => void;
}) {
  const host = useDocsHost();
  const [draft, setDraft] = useState(start);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [picking, setPicking] = useState<Picking>(null);
  const [slashAt, setSlashAt] = useState(0);
  const [arrowsFor, setArrowsFor] = useState<string | null>(null);
  const [token, setToken] = useState(() => (source === null ? '' : savedToken(source.url)));
  const [who, setWho] = useState<{ name: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const mount = useRef<HTMLDivElement>(null);
  const files = useRef<HTMLInputElement>(null);
  /** Target for the file picker: insert at a position, or replace a picture. */
  const fileTarget = useRef<{ at: number } | { replace: string }>({ at: 0 });
  const change = (patch: Partial<Draft>) => setDraft((was) => ({ ...was, ...patch }));
  const urls = useObjectUrls(draft.images);

  useEffect(() => {
    if (draft.id === '') return;
    setSaved(false);
    const timer = setTimeout(() => void saveDraft(draft).then(() => setSaved(true)), 400);
    return () => clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    if (source === null || token === '') return setWho(null);
    let live = true;
    whoAmI(source, token)
      .then((found) => live && setWho(found))
      .catch(() => live && setWho(null));
    return () => {
      live = false;
    };
  }, [source, token]);

  async function addFiles(chosen: readonly File[], at: number) {
    setProblem(null);
    let images = draft.images;
    const added: string[] = [];
    for (const file of chosen) {
      if (Object.keys(images).length >= LIMITS.images) {
        setProblem(`An article holds at most ${LIMITS.images} pictures.`);
        break;
      }
      try {
        const ready = await preparePicture(file);
        const key = nameFor(Object.keys(images), file.name);
        images = {
          ...images,
          [key]: { bytes: ready.bytes, mime: ready.mime, alt: '', arrows: [] },
        };
        added.push(key);
      } catch (error) {
        setProblem(error instanceof Error ? error.message : 'That picture could not be used.');
      }
    }
    setDraft((was) => ({ ...was, images }));
    for (const key of added.reverse()) editing.insertFigure(key, at);
  }

  async function replaceFile(key: string, file: File) {
    try {
      const ready = await preparePicture(file);
      setDraft((was) => {
        const image = was.images[key];
        return image === undefined
          ? was
          : {
              ...was,
              images: { ...was.images, [key]: { ...image, bytes: ready.bytes, mime: ready.mime } },
            };
      });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That picture could not be used.');
    }
  }

  const editing = useProseMirror({
    mount,
    markdown: start.body,
    onChange: (body) => change({ body }),
    keyOf: host.keyOf,
    pictures: {
      picture: (key) => {
        const image = draft.images[key];
        return image === undefined
          ? undefined
          : { src: urls[key] ?? '', alt: image.alt, arrows: image.arrows };
      },
      setAlt: (key, alt) =>
        setDraft((was) => {
          const image = was.images[key];
          return image === undefined
            ? was
            : { ...was, images: { ...was.images, [key]: { ...image, alt } } };
        }),
      editArrows: setArrowsFor,
      replace: (key) => {
        fileTarget.current = { replace: key };
        files.current?.click();
      },
    },
    onFiles: (chosen, at) => void addFiles(chosen, at),
  });
  const { view } = editing;

  // Menu state derives from the selection and is re-read on every change (`tick`).
  const state = view?.state;
  const focused = view?.hasFocus() ?? false;
  const slash = useMemo(() => {
    if (state === undefined || !state.selection.empty) return null;
    const { $from } = state.selection;
    if ($from.parent.type !== nodes.paragraph) return null;
    const before = $from.parent.textBetween(0, $from.parentOffset);
    const match = /^\/([a-z ]{0,20})$/i.exec(before);
    return match === null ? null : { query: match[1] ?? '', from: $from.pos - before.length };
  }, [state]);
  const slashItems = slash === null ? [] : slashMatches(slash.query);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the "/" query changes
  useEffect(() => setSlashAt(0), [slash?.query]);

  function runSlash(item: SlashItem) {
    if (view === null || slash === null) return;
    view.dispatch(view.state.tr.delete(slash.from, view.state.selection.from));
    const anchor = anchorAt(view, view.state.selection.from);
    if (item.id === 'picture') {
      fileTarget.current = { at: view.state.selection.from };
      files.current?.click();
    } else if (item.id === 'key') {
      if (anchor !== null) setPicking({ kind: 'key', anchor });
    } else if (item.id === 'link') {
      if (anchor !== null) setPicking({ kind: 'link', anchor, insert: true });
    } else setBlock(item.id)(view.state, view.dispatch, view);
    view.focus();
  }

  // While the "/" menu is open it handles navigation keys before the editor.
  useEffect(() => {
    const place = mount.current;
    if (place === null || slash === null || slashItems.length === 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') setSlashAt((n) => (n + 1) % slashItems.length);
      else if (event.key === 'ArrowUp')
        setSlashAt((n) => (n - 1 + slashItems.length) % slashItems.length);
      else if (event.key === 'Enter') {
        const item = slashItems[slashAt];
        if (item !== undefined) runSlash(item);
      } else if (event.key === 'Escape' && view !== null)
        view.dispatch(view.state.tr.delete(slash.from, view.state.selection.from));
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    place.addEventListener('keydown', onKey, true);
    return () => place.removeEventListener('keydown', onKey, true);
  });

  const bubble =
    view !== null &&
    state !== undefined &&
    focused &&
    !state.selection.empty &&
    picking === null &&
    state.selection instanceof TextSelection
      ? anchorAt(view, state.selection.from)
      : null;
  const block = (kind: string) =>
    view !== null && state !== undefined && setBlock(kind)(state, view.dispatch, view);
  const mark = (type: typeof marks.strong) =>
    view !== null && state !== undefined && toggleMark(type)(state, view.dispatch);

  const article: DocArticle = {
    id: draft.id || idFromTitle(draft.title) || 'untitled',
    title: draft.title,
    area: draft.area,
    summary: draft.summary,
    keywords: draft.keywords,
    body: draft.body,
    images: {},
  };
  const wrong = draft.title.trim() === '' ? 'Give the article a title.' : problemWith(article);

  async function publish() {
    if (source === null) return onDone(null);
    if (who === null) return setAsking(true);
    if (wrong !== null) return setProblem(wrong);
    setBusy(true);
    setProblem(null);
    try {
      const ready = shown({ ...draft, id: article.id });
      const done = await sendArticle(source, token, outgoing(ready));
      await deleteDraft(draft.id);
      onDone(done.id);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The article could not be published.');
    } finally {
      setBusy(false);
    }
  }

  const picture = arrowsFor === null ? undefined : draft.images[arrowsFor];
  return (
    <section
      aria-label="Edit the article"
      className="wiki-editor"
      data-markdown={showMarkdown ? '' : undefined}
    >
      <header className="wiki-bar">
        <button className="wiki-bar__quiet" onClick={onCancel} type="button">
          Close
        </button>
        <span className="wiki-bar__status">
          {existing.has(draft.id) ? 'Editing' : 'New article'}
          {saved ? ' · saved on this device' : ''}
        </span>
        <label className="wiki-switch">
          <input
            aria-checked={showMarkdown}
            checked={showMarkdown}
            onChange={(event) => setShowMarkdown(event.target.checked)}
            role="switch"
            type="checkbox"
          />
          <span>Show Markdown</span>
        </label>
        <button
          className="wiki-bar__primary"
          disabled={busy}
          onClick={() => void publish()}
          type="button"
        >
          {source === null ? 'Done' : busy ? 'Publishing…' : 'Publish'}
        </button>
      </header>

      {asking && source !== null && who === null && (
        <div className="wiki-token">
          <label>
            <span>Your token for {source.name}</span>
            <input
              autoComplete="off"
              onChange={(event) => {
                setToken(event.target.value);
                saveToken(source.url, event.target.value);
              }}
              placeholder="From the store's owner"
              type="password"
              value={token}
            />
          </label>
          <p>Reading needs nothing. Changing the wiki needs a token from whoever runs the store.</p>
        </div>
      )}
      {problem !== null && (
        <p className="wiki-problem" role="alert">
          {problem}
        </p>
      )}

      <div className="wiki-editor__columns">
        <div className="wiki-editor__page">
          <input
            aria-label="Title"
            className="wiki-editor__title"
            maxLength={LIMITS.title}
            onChange={(event) =>
              change({
                title: event.target.value,
                // The id follows the title until the article exists; changing it afterwards would
                // create a second article.
                ...(existing.has(draft.id) ||
                (draft.id !== '' && draft.id !== idFromTitle(draft.title))
                  ? {}
                  : { id: idFromTitle(event.target.value) }),
              })
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') editing.focus();
            }}
            placeholder="Title"
            value={draft.title}
          />
          <input
            aria-label="What it is for"
            className="wiki-editor__summary"
            maxLength={LIMITS.summary}
            onChange={(event) => change({ summary: event.target.value })}
            placeholder="What it is for, in one sentence"
            value={draft.summary}
          />
          <div className="wiki-editor__meta">
            <select
              aria-label="Area"
              onChange={(event) => change({ area: event.target.value as DocArea })}
              value={draft.area}
            >
              {DOC_AREAS.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <input
              aria-label="Words to find it by"
              maxLength={LIMITS.keywords}
              onChange={(event) => change({ keywords: event.target.value })}
              placeholder="Words to find it by"
              value={draft.keywords}
            />
          </div>
          <div
            className="wiki-editor__mount"
            data-empty={draft.body === '' ? '' : undefined}
            ref={mount}
          />
          <p className="wiki-editor__hint">
            Type / for headings, steps, notes, pictures and keys. Drop or paste a picture anywhere.
          </p>
        </div>
        {showMarkdown && (
          <textarea
            aria-label="The article, in Markdown"
            className="wiki-editor__markdown"
            maxLength={LIMITS.body}
            onChange={(event) => {
              change({ body: event.target.value });
              editing.setMarkdown(event.target.value);
            }}
            spellCheck={false}
            value={draft.body}
          />
        )}
      </div>

      {bubble !== null && state !== undefined && (
        <BubbleBar
          anchor={bubble}
          items={[
            {
              id: 'b',
              label: <b>B</b>,
              title: 'Bold',
              on: isMarkOn(state, marks.strong),
              run: () => mark(marks.strong),
            },
            {
              id: 'i',
              label: <i>I</i>,
              title: 'Italic',
              on: isMarkOn(state, marks.em),
              run: () => mark(marks.em),
            },
            {
              id: 'c',
              label: <code>{'<>'}</code>,
              title: 'Code',
              on: isMarkOn(state, marks.code),
              run: () => mark(marks.code),
            },
            {
              id: 'link',
              label: 'Link',
              title: 'Link to an article or a web page',
              on: isMarkOn(state, marks.link),
              run: () => {
                if (view === null) return;
                if (isMarkOn(state, marks.link)) {
                  const { from, to } = state.selection;
                  view.dispatch(state.tr.removeMark(from, to, marks.link));
                } else setPicking({ kind: 'link', anchor: bubble, insert: false });
              },
            },
            { id: 'h2', label: 'H', title: 'Heading', on: false, run: () => block('h2') },
            { id: 'h3', label: 'h', title: 'Subheading', on: false, run: () => block('h3') },
          ]}
        />
      )}
      {slash !== null &&
        view !== null &&
        picking === null &&
        (() => {
          const anchor = anchorAt(view, slash.from);
          return anchor === null ? null : (
            <SlashMenu active={slashAt} anchor={anchor} items={slashItems} onPick={runSlash} />
          );
        })()}
      {picking?.kind === 'link' && (
        <LinkPicker
          anchor={picking.anchor}
          articles={articles}
          onClose={() => {
            setPicking(null);
            editing.focus();
          }}
          onLink={(href, title) => {
            setPicking(null);
            if (view === null) return;
            const link = marks.link.create({ href });
            const { from, to } = view.state.selection;
            const tr = picking.insert
              ? view.state.tr.insert(from, view.state.schema.text(title, [link]))
              : view.state.tr.addMark(from, to, link);
            view.dispatch(tr);
            view.focus();
          }}
        />
      )}
      {picking?.kind === 'key' && (
        <KeyPicker
          actions={host.actions ?? []}
          anchor={picking.anchor}
          onClose={() => {
            setPicking(null);
            editing.focus();
          }}
          onPick={(action) => {
            setPicking(null);
            if (view === null) return;
            view.dispatch(view.state.tr.replaceSelectionWith(nodes.key.create({ action })));
            view.focus();
          }}
        />
      )}

      <input
        accept="image/png,image/jpeg,image/webp"
        aria-label="Choose a picture"
        hidden
        onChange={(event) => {
          const chosen = [...(event.target.files ?? [])];
          const target = fileTarget.current;
          if ('replace' in target) {
            const first = chosen[0];
            if (first !== undefined) void replaceFile(target.replace, first);
          } else void addFiles(chosen, target.at);
          event.target.value = '';
        }}
        ref={files}
        type="file"
      />
      {arrowsFor !== null && picture !== undefined && (
        <ArrowEditor
          alt={picture.alt}
          arrows={picture.arrows}
          onCancel={() => setArrowsFor(null)}
          onDone={(arrows) => {
            const key = arrowsFor;
            setDraft((was) => {
              const image = was.images[key];
              return image === undefined
                ? was
                : { ...was, images: { ...was.images, [key]: { ...image, arrows } } };
            });
            setArrowsFor(null);
          }}
          src={urls[arrowsFor] ?? ''}
        />
      )}
    </section>
  );
}
