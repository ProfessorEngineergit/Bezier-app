/** The wiki index: articles grouped by area, a filter, and local drafts. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { type Draft, deleteDraft, listDrafts } from '../client/drafts.js';
import { DOC_AREAS, type DocArticle } from '../format/article.js';
import { findArticles } from '../format/search.js';
import { useWiki } from './wiki-state.js';

export function WikiList({ compact }: { compact: boolean }) {
  const wiki = useWiki();
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const field = useRef<HTMLInputElement>(null);
  const terms = useMemo(() => query.trim().split(/\s+/).filter(Boolean), [query]);
  const found = useMemo(() => findArticles(terms, wiki.articles), [terms, wiki.articles]);

  const loadDrafts = () =>
    void listDrafts()
      .then(setDrafts)
      .catch(() => undefined);
  useEffect(loadDrafts, []);

  const row = (article: DocArticle) => (
    <li key={article.id}>
      <button className="wiki-row" onClick={() => wiki.open(article.id)} type="button">
        <span className="wiki-row__title">{article.title}</span>
        <span className="wiki-row__summary">{article.summary}</span>
        {terms.length > 0 && <span className="wiki-row__area">{article.area}</span>}
      </button>
    </li>
  );

  return (
    <div className="wiki-list" data-compact={compact ? '' : undefined}>
      <div className="wiki-list__tools">
        <label className="wiki-search">
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            aria-label="Search the wiki"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              const first = found[0];
              if (event.key === 'Enter' && first !== undefined) wiki.open(first.id);
              if (event.key === 'Escape') setQuery('');
            }}
            placeholder="Search the wiki"
            ref={field}
            type="search"
            value={query}
          />
          <kbd title="From anywhere in Bezier">⌘K</kbd>
        </label>
        {wiki.editable && (
          <button className="wiki-button" onClick={() => wiki.write()} type="button">
            New article
          </button>
        )}
      </div>
      {wiki.problem !== null && (
        <p className="wiki-problem" role="alert">
          {wiki.problem} The app's own articles are here either way.{' '}
          <button className="wiki-text-button" onClick={wiki.refresh} type="button">
            Try again
          </button>
        </p>
      )}

      {wiki.editable && drafts.length > 0 && terms.length === 0 && (
        <section aria-label="Your drafts" className="wiki-area">
          <h2 className="wiki-area__title">Your drafts</h2>
          <ul className="wiki-rows">
            {drafts.map((draft) => (
              <li className="wiki-row--draft" key={draft.id || draft.updatedAt}>
                <button className="wiki-row" onClick={() => wiki.write(draft)} type="button">
                  <span className="wiki-row__title">{draft.title || 'Untitled'}</span>
                  <span className="wiki-row__summary">{draft.summary || 'Not published yet'}</span>
                </button>
                <button
                  aria-label={`Delete the draft ${draft.title || 'Untitled'}`}
                  className="wiki-text-button"
                  onClick={() => void deleteDraft(draft.id).then(loadDrafts)}
                  type="button"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {terms.length > 0 ? (
        found.length === 0 ? (
          <p className="wiki-none">
            Nothing matches. Try another word for it, or fewer words.
            {wiki.editable && (
              <>
                {' '}
                Not written yet?{' '}
                <button className="wiki-text-button" onClick={() => wiki.write()} type="button">
                  Write it
                </button>
              </>
            )}
          </p>
        ) : (
          <ul className="wiki-rows">{found.map(row)}</ul>
        )
      ) : (
        DOC_AREAS.map((area) => {
          const inArea = wiki.articles.filter((article) => article.area === area);
          return inArea.length === 0 ? null : (
            <section aria-label={area} className="wiki-area" key={area}>
              <h2 className="wiki-area__title">
                {area}
                <small>{inArea.length}</small>
              </h2>
              <ul className="wiki-rows">{inArea.map(row)}</ul>
            </section>
          );
        })
      )}
    </div>
  );
}
