/**
 * Nib's user settings: name, colours, and which unprompted topics he may raise. Stored with the
 * other preferences (`preferences.ts`) and read when shown, so changes apply at once. Things the
 * user asked for (a lesson, the menu) and crashes cannot be switched off.
 */

export interface NibShows {
  /** Long-running work, with progress. */
  work: boolean;
  /** The machine struggling, and what helps. */
  strain: boolean;
  /** A workspace's lesson, offered the first time it opens. */
  firsts: boolean;
  /** A note when something is done for the first time (friendly only). */
  notes: boolean;
}

export interface NibStyle {
  name: string;
  /** Eye light and shell colour, `#rrggbb`. */
  eyes: string;
  body: string;
  shows: NibShows;
}

/** Eye colours offered; the first is the default. */
export const NIB_EYES: readonly (readonly [string, string])[] = [
  ['#f4f6ff', 'White'],
  ['#5ac8fa', 'Sky'],
  ['#30d158', 'Mint'],
  ['#ffd60a', 'Amber'],
  ['#ff6482', 'Rose'],
  ['#bf5af2', 'Violet'],
];

/** Shell colours offered. */
export const NIB_BODIES: readonly (readonly [string, string])[] = [
  ['#f2f2f0', 'White'],
  ['#4a4c52', 'Graphite'],
  ['#e3d4b8', 'Sand'],
  ['#bfe3d6', 'Mint'],
  ['#c9d6f2', 'Ice'],
];

export const DEFAULT_NIB_STYLE: NibStyle = {
  name: 'Nib',
  eyes: '#f4f6ff',
  body: '#f2f2f0',
  shows: { work: true, strain: true, firsts: true, notes: true },
};

const hex = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;

const flag = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

/** Parses stored settings field by field. */
export function parseNibStyle(value: unknown): NibStyle {
  const source =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const shows =
    typeof source.shows === 'object' && source.shows !== null
      ? (source.shows as Record<string, unknown>)
      : {};
  const name = typeof source.name === 'string' ? source.name.trim().slice(0, 24) : '';
  const fallback = DEFAULT_NIB_STYLE.shows;
  return {
    name: name === '' ? DEFAULT_NIB_STYLE.name : name,
    eyes: hex(source.eyes, DEFAULT_NIB_STYLE.eyes),
    body: hex(source.body, DEFAULT_NIB_STYLE.body),
    shows: {
      work: flag(shows.work, fallback.work),
      strain: flag(shows.strain, fallback.strain),
      firsts: flag(shows.firsts, fallback.firsts),
      notes: flag(shows.notes, fallback.notes),
    },
  };
}
