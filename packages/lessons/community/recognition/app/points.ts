/**
 * Contribution points and levels.
 *
 * Awarded automatically from counted events. Weighted towards real use (a finished lesson, a kept
 * plugin) and capped per day so bursts cannot buy a level. The server applies this table; the app
 * only displays it.
 */

export type Contribution =
  | 'lesson-published'
  | 'plugin-published'
  | 'plugin-version'
  | 'article-published'
  | 'lesson-finished-by-someone'
  | 'lesson-stepped-into'
  | 'star-received'
  | 'plugin-kept-a-week'
  | 'lesson-finished'
  | 'model-made-mine'
  | 'week-streak'
  | 'report-upheld';

export interface Rule {
  points: number;
  /** Maximum awards per item per day. */
  dailyCap: number;
  /** Description shown in the intro and profile. */
  text: string;
}

export const POINTS: Record<Contribution, Rule> = {
  'lesson-published': { points: 50, dailyCap: 3, text: 'Publish a lesson' },
  'plugin-published': { points: 50, dailyCap: 1, text: 'Publish a plugin' },
  'article-published': { points: 30, dailyCap: 5, text: 'Publish a docs article' },
  'plugin-version': { points: 10, dailyCap: 1, text: 'Ship a plugin update' },
  'lesson-finished-by-someone': { points: 5, dailyCap: 100, text: 'Someone finishes your lesson' },
  'lesson-stepped-into': {
    points: 2,
    dailyCap: 100,
    text: 'Someone opens the model in your lesson',
  },
  'star-received': { points: 10, dailyCap: 50, text: 'Someone stars your work' },
  'plugin-kept-a-week': { points: 1, dailyCap: 500, text: 'Someone keeps your plugin for a week' },
  'lesson-finished': { points: 10, dailyCap: 10, text: 'Finish a lesson' },
  'model-made-mine': { points: 3, dailyCap: 10, text: 'Step into a lesson and keep the model' },
  'week-streak': { points: 20, dailyCap: 1, text: 'Learn something every week' },
  'report-upheld': { points: 15, dailyCap: 3, text: 'Report a problem that gets fixed' },
};

/** Levels, named after modelling steps. */
export const LEVELS = [
  { name: 'Sketch', from: 0 },
  { name: 'Extrude', from: 100 },
  { name: 'Fillet', from: 300 },
  { name: 'Loft', from: 1_000 },
  { name: 'Sweep', from: 3_000 },
  { name: 'Assembly', from: 10_000 },
  { name: 'Kernel', from: 30_000 },
] as const;

export function levelFor(points: number): {
  name: string;
  /** 0–1 of the way to the next level; 1 at the top. */
  progress: number;
  next: string | null;
} {
  const index = LEVELS.findLastIndex((level) => points >= level.from);
  const level = LEVELS[Math.max(0, index)] ?? LEVELS[0];
  const next = LEVELS[index + 1];
  if (next === undefined) return { name: level.name, progress: 1, next: null };
  return {
    name: level.name,
    progress: (points - level.from) / (next.from - level.from),
    next: next.name,
  };
}

/** Points for `count` occurrences on one item in one day, after the daily cap. */
export const pointsFor = (contribution: Contribution, count: number): number =>
  POINTS[contribution].points * Math.min(Math.max(0, count), POINTS[contribution].dailyCap);
