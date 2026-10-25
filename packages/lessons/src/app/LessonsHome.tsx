/**
 * The Lessons home on the start page's Learn tab. Shows the list, the player or the edit view
 * according to shared state, so a recording finished over the editor can open its edit view here.
 */

import '../ui/lessons.css';
import '../ui/chrome.css';
import '../ui/notice.css';
import type { ReactNode } from 'react';
import { EditView } from '../edit/EditView.js';
import { Home } from '../home/Home.js';
import { Player } from '../player/Player.js';
import { LessonsProvider, useLessonsState } from './context.js';
import type { Lessons } from './lessons.js';
import { NoticeLine } from './NoticeLine.js';
import { useHostLook } from './useHostLook.js';

interface Extras {
  tools?: ReactNode;
  after?: ReactNode;
  ownTitle?: string;
}

function Screen({ query, extras }: { query: string; extras: Extras }) {
  const { screen } = useLessonsState();
  switch (screen.kind) {
    case 'player':
      return <Player at={screen.at} id={screen.id} key={screen.id} />;
    case 'edit':
      return <EditView id={screen.id} key={screen.id} />;
    default:
      return <Home query={query} {...extras} />;
  }
}

/** `query` is the start page's search text; the lesson list is filtered by it. */
export function LessonsHome({
  lessons,
  query = '',
  ...extras
}: { lessons: Lessons; query?: string } & Extras) {
  const look = useHostLook(lessons.host);
  return (
    <LessonsProvider value={lessons}>
      <div
        className="lessons lessons-root"
        data-reduced-motion={look.reducedMotion ? 'true' : undefined}
        data-scheme={look.scheme}
      >
        <NoticeLine over="home" />
        <Screen extras={extras} query={query} />
      </div>
    </LessonsProvider>
  );
}
