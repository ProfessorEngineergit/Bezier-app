/**
 * Wiki articles matched by a start-page search, below the matching projects and settings. Choosing
 * one opens it.
 */

import type { DocArticle } from '@bezier/lessons';

export function WikiHits({
  hits,
  onOpen,
}: {
  hits: readonly DocArticle[];
  onOpen: (id: string) => void;
}) {
  if (hits.length === 0) return null;
  return (
    <section aria-label="Wiki" className="library__hits">
      <h2>Wiki</h2>
      <ul>
        {hits.slice(0, 5).map((hit) => (
          <li key={hit.id}>
            <button onClick={() => onOpen(hit.id)} type="button">
              <span>{hit.title}</span>
              <small>Wiki / {hit.area}</small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
