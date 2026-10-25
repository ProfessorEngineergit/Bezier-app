/** The store's leaderboard, with an explanation of what is counted at the top. */

import { useEffect, useState } from 'react';
import { POINTS } from '../recognition/app/points.js';
import type { Standing } from '../server/leaderboard.js';
import { CommunityFrame, type CommunityKind } from './CommunityFrame.js';

export function Leaderboard({
  url,
  name,
  onKind,
}: {
  /** The store's base URL; `/leaderboard` is appended here. */
  url: string;
  name: string;
  onKind?: (next: CommunityKind) => void;
}) {
  const [authors, setAuthors] = useState<Standing[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` triggers a reload
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${url}/leaderboard/v1/authors`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('refused');
        return response.json() as Promise<{ authors: Standing[] }>;
      })
      .then((body) => {
        setAuthors(body.authors);
        setProblem(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setProblem(`${name} did not answer. Check your connection and try again.`);
      });
    return () => controller.abort();
  }, [url, name, round]);

  return (
    <CommunityFrame
      kind="leaderboard"
      message={null}
      note={name}
      onDismiss={() => {}}
      onKind={onKind}
    >
      <p className="lessons-dim cl-lead">
        Points for what has been listed here after a person read it:{' '}
        {POINTS['lesson-published'].points} for a lesson, {POINTS['plugin-published'].points} for a
        plugin, {POINTS['article-published'].points} for a wiki article. Finishing a lesson, keeping
        a plugin and stars are not counted yet.
      </p>
      {problem !== null && (
        <div className="cl-inline-error" role="alert">
          <span>{problem}</span>
          <button className="cl-text-button" onClick={() => setRound((n) => n + 1)} type="button">
            Try again
          </button>
        </div>
      )}
      {authors?.length === 0 && <p className="lessons-dim">Nobody has anything listed yet.</p>}
      {authors !== null && authors.length > 0 && (
        <ol aria-label="Authors by points" className="cl-board">
          {authors.map((author, index) => (
            <li className="cl-board__row" key={author.name}>
              <span className="cl-board__rank">{index + 1}</span>
              <span className="cl-board__name">{author.name}</span>
              <span className="cl-board__level">{author.level}</span>
              <span className="cl-board__what">
                {[
                  author.lessons > 0 &&
                    `${author.lessons} ${author.lessons === 1 ? 'lesson' : 'lessons'}`,
                  author.plugins > 0 &&
                    `${author.plugins} ${author.plugins === 1 ? 'plugin' : 'plugins'}`,
                  author.articles > 0 &&
                    `${author.articles} ${author.articles === 1 ? 'article' : 'articles'}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className="cl-board__points">{author.points}</span>
            </li>
          ))}
        </ol>
      )}
    </CommunityFrame>
  );
}
