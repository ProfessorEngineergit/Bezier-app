/**
 * The wiki content, used both on the Community page and in floating windows: the list, an
 * article, its history, an earlier version, and the editor.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { getDoc, historyOf, restoreVersion, type Version, versionOf } from '../client/api.js';
import { type Draft, emptyDraft } from '../client/drafts.js';
import { savedToken } from '../client/token.js';
import type { DocArticle } from '../format/article.js';
import { ArticleBody } from './Article.js';
import { WikiEditor } from './WikiEditor.js';
import { WikiList } from './WikiList.js';
import { useWiki, type WikiView as View } from './wiki-state.js';

/**
 * Converts an article to a draft by fetching its pictures as bytes. Pictures that fail to load are
 * skipped; the editor shows them as missing with a Replace action.
 */
async function asDraft(article: DocArticle): Promise<Draft> {
  const images: Draft['images'] = {};
  for (const [key, image] of Object.entries(article.images)) {
    const response = await fetch(image.src).catch(() => null);
    const type = response?.headers.get('content-type') ?? '';
    if (response === null || !response.ok || !type.startsWith('image/')) continue;
    const blob = await response.blob();
    images[key] = {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime: blob.type,
      alt: image.alt,
      arrows: image.arrows,
    };
  }
  return {
    ...emptyDraft(article.id),
    title: article.title,
    area: article.area,
    summary: article.summary,
    keywords: article.keywords,
    body: article.body,
    images,
  };
}

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function WikiView({ place }: { place: 'page' | 'floating' }) {
  const wiki = useWiki();
  const compact = place === 'floating';
  const known = useMemo(
    () => new Map(wiki.articles.map((article) => [article.id, article])),
    [wiki.articles],
  );
  const view = wiki.view;
  const root = useRef<HTMLDivElement>(null);
  const shown = view.kind === 'edit' ? `edit:${view.draft.id}` : JSON.stringify(view);

  // Scroll to the top when the view changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when `shown` changes
  useEffect(() => {
    let at = root.current?.parentElement ?? null;
    while (at !== null && at.scrollHeight <= at.clientHeight) at = at.parentElement;
    if (at !== null && at.scrollTop > 0) at.scrollTop = 0;
  }, [shown]);

  return (
    <div className="wiki" data-place={place} ref={root}>
      {view.kind === 'list' && <WikiList compact={compact} />}
      {view.kind === 'article' && (
        <ArticleView compact={compact} found={known.get(view.id)} id={view.id} />
      )}
      {view.kind === 'edit' && (
        <WikiEditor
          articles={wiki.articles}
          draft={view.draft}
          existing={new Set(known.keys())}
          key={view.draft.id || view.draft.updatedAt}
          onCancel={() =>
            wiki.show(
              known.has(view.draft.id) ? { kind: 'article', id: view.draft.id } : { kind: 'list' },
            )
          }
          onDone={(published) => {
            wiki.refresh();
            wiki.show(published === null ? { kind: 'list' } : { kind: 'article', id: published });
          }}
          source={wiki.source}
        />
      )}
      {view.kind === 'history' && <History id={view.id} />}
      {view.kind === 'version' && <OldVersion id={view.id} seq={view.seq} />}
    </div>
  );
}

function Crumbs({ area, title }: { area?: string; title?: string }) {
  const wiki = useWiki();
  return (
    <nav aria-label="Where in the wiki" className="wiki-crumbs">
      <button onClick={() => wiki.show({ kind: 'list' })} type="button">
        Wiki
      </button>
      {area !== undefined && <span>{area}</span>}
      {title !== undefined && <span>{title}</span>}
    </nav>
  );
}

function ArticleView({
  id,
  found,
  compact,
}: {
  id: string;
  found: DocArticle | undefined;
  compact: boolean;
}) {
  const wiki = useWiki();
  const [fetched, setFetched] = useState<DocArticle | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const article = found ?? fetched;

  useEffect(() => {
    if (found !== undefined || wiki.source === null) return;
    getDoc(wiki.source, id)
      .then(setFetched)
      .catch(() => setProblem('That article could not be found.'));
  }, [found, id, wiki.source]);

  async function edit() {
    if (article === undefined || article === null) return;
    setProblem(null);
    try {
      wiki.write(await asDraft(article));
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : 'That article cannot be changed from here.',
      );
    }
  }

  if (article === undefined || article === null)
    return (
      <div className="wiki-page">
        <Crumbs />
        <p className="wiki-none">{problem ?? 'Looking for that article…'}</p>
      </div>
    );
  return (
    <article className="wiki-page" data-compact={compact ? '' : undefined}>
      <div className="wiki-page__bar">
        <Crumbs area={article.area} />
        <span className="wiki-page__gap" />
        {wiki.editable && article.author !== undefined && (
          <button
            className="wiki-text-button"
            onClick={() => wiki.show({ kind: 'history', id: article.id })}
            type="button"
          >
            History
          </button>
        )}
        {wiki.editable && (
          <button className="wiki-button" onClick={() => void edit()} type="button">
            Edit
          </button>
        )}
      </div>
      {problem !== null && (
        <p className="wiki-problem" role="alert">
          {problem}
        </p>
      )}
      <h1 className="wiki-page__title">{article.title}</h1>
      <p className="wiki-page__summary">{article.summary}</p>
      <ArticleBody article={article} onOpen={(next) => wiki.show({ kind: 'article', id: next })} />
      <p className="wiki-page__by">
        {article.author === undefined
          ? wiki.editable
            ? 'Comes with Bezier. Edit it, and your version is the one everyone reads.'
            : 'Comes with Bezier.'
          : `Last edited by ${article.author}${article.updatedAt === undefined ? '' : `, ${when(article.updatedAt)}`}.`}
      </p>
    </article>
  );
}

function History({ id }: { id: string }) {
  const wiki = useWiki();
  const [versions, setVersions] = useState<readonly Version[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (wiki.source === null) return;
    historyOf(wiki.source, id)
      .then(setVersions)
      .catch((error: unknown) =>
        setProblem(error instanceof Error ? error.message : String(error)),
      );
  }, [id, wiki.source]);
  const title = wiki.articles.find((article) => article.id === id)?.title ?? id;
  return (
    <div className="wiki-page">
      <div className="wiki-page__bar">
        <Crumbs title={title} />
        <span className="wiki-page__gap" />
        <button
          className="wiki-text-button"
          onClick={() => wiki.show({ kind: 'article', id })}
          type="button"
        >
          Back to the article
        </button>
      </div>
      <h1 className="wiki-page__title">History</h1>
      <p className="wiki-page__summary">
        Every version of “{title}”, newest first. Any one can be put back.
      </p>
      {problem !== null && <p className="wiki-problem">{problem}</p>}
      {versions === null ? (
        <p className="wiki-none">Reading the history…</p>
      ) : (
        <ul className="wiki-rows">
          {versions.map((version, index) => (
            <li key={version.seq}>
              <button
                className="wiki-row"
                onClick={() => wiki.show({ kind: 'version', id, seq: version.seq })}
                type="button"
              >
                <span className="wiki-row__title">
                  {when(version.createdAt)}
                  {index === 0 && <small> · live now</small>}
                </span>
                <span className="wiki-row__summary">
                  {version.author} · {version.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OldVersion({ id, seq }: { id: string; seq: number }) {
  const wiki = useWiki();
  const [article, setArticle] = useState<DocArticle | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (wiki.source === null) return;
    versionOf(wiki.source, id, seq)
      .then(setArticle)
      .catch((error: unknown) =>
        setProblem(error instanceof Error ? error.message : String(error)),
      );
  }, [id, seq, wiki.source]);

  async function restore() {
    const source = wiki.source;
    if (source === null) return;
    const token = savedToken(source.url);
    if (token === '')
      return setProblem('Putting a version back needs a token. Edit any article once to give it.');
    setBusy(true);
    try {
      await restoreVersion(source, token, id, seq);
      wiki.refresh();
      wiki.show({ kind: 'article', id });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wiki-page">
      <div className="wiki-page__bar">
        <Crumbs title={article?.title ?? id} />
        <span className="wiki-page__gap" />
        <button
          className="wiki-text-button"
          onClick={() => wiki.show({ kind: 'history', id })}
          type="button"
        >
          All versions
        </button>
        <button
          className="wiki-button"
          disabled={busy || article === null}
          onClick={() => void restore()}
          type="button"
        >
          Put this version back
        </button>
      </div>
      {problem !== null && <p className="wiki-problem">{problem}</p>}
      {article === null ? (
        <p className="wiki-none">Reading this version…</p>
      ) : (
        <>
          <p className="wiki-banner">
            An earlier version, by {article.author ?? 'someone'}
            {article.updatedAt === undefined ? '' : `, ${when(article.updatedAt)}`}.
          </p>
          <h1 className="wiki-page__title">{article.title}</h1>
          <p className="wiki-page__summary">{article.summary}</p>
          <ArticleBody
            article={article}
            onOpen={(next) => wiki.show({ kind: 'article', id: next })}
          />
        </>
      )}
    </div>
  );
}

export type { View };
