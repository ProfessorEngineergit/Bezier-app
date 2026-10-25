/**
 * A community store's leaderboard: authors ranked by points for their listed contributions.
 *
 * Only what the store knows is counted, using recognition/app/points.ts: approved lessons, plugins
 * and docs articles. On-device counts (finished lessons, kept plugins, stars) are not built yet
 * (recognition/README.md, phase 0), and the page says so. Only authors with listed items appear,
 * under the account name the store owner assigned.
 */

import { createServer, type Server } from 'node:http';
import { levelFor, POINTS } from '../recognition/app/points.js';
import { httpKit } from './http-kit.js';

export interface Counted {
  author: string;
  count: number;
}

export interface Sources {
  lessons: () => Counted[];
  plugins: () => Counted[];
  docs: () => Counted[];
}

export interface Standing {
  name: string;
  points: number;
  level: string;
  lessons: number;
  plugins: number;
  articles: number;
}

export function standings(sources: Sources): Standing[] {
  const by = new Map<string, Standing>();
  const entry = (name: string): Standing => {
    const found = by.get(name);
    if (found !== undefined) return found;
    const fresh = { name, points: 0, level: '', lessons: 0, plugins: 0, articles: 0 };
    by.set(name, fresh);
    return fresh;
  };
  for (const { author, count } of sources.lessons()) entry(author).lessons = count;
  for (const { author, count } of sources.plugins()) entry(author).plugins = count;
  for (const { author, count } of sources.docs()) entry(author).articles = count;
  return (
    [...by.values()]
      .map((standing) => {
        const points =
          standing.lessons * POINTS['lesson-published'].points +
          standing.plugins * POINTS['plugin-published'].points +
          standing.articles * POINTS['article-published'].points;
        return { ...standing, points, level: levelFor(points).name };
      })
      // Break ties by name, not by seniority.
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
      .slice(0, 50)
  );
}

export function createLeaderboardApp(sources: Sources, origins: readonly string[] = ['*']): Server {
  // Same CORS as the other servers, so the desktop app (tauri://localhost) is still allowed once an
  // operator lists explicit origins.
  const kit = httpKit({ origins: [...origins], trustProxy: false });
  return createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (req.method === 'OPTIONS') {
      res
        .writeHead(
          204,
          kit.headers(req, {
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Max-Age': '86400',
          }),
        )
        .end();
      return;
    }
    if (req.method === 'GET' && path === '/v1/authors') {
      kit.json(req, res, 200, { authors: standings(sources) }, 'public, max-age=60');
      return;
    }
    kit.json(req, res, 404, { error: 'There is nothing here.' });
  });
}
