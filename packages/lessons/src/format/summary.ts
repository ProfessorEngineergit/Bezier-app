/**
 * A small per-lesson record derived from the manifest, stored beside the lessons so the home can
 * list them without reading any video.
 */

import type { LessonLevel, LessonManifest } from './manifest.js';
import { keptStretches, playableDuration } from './timeline.js';

export interface LessonSummary {
  id: string;
  title: string;
  description: string;
  level: LessonLevel | undefined;
  createdAt: string;
  /** Seconds of playback, with the removed stretches left out. */
  length: number;
  chapters: { time: number; title: string }[];
  completed: boolean;
  hasCamera: boolean;
  /** Bytes of media on this device. */
  bytes: number;
}

export function summarize(manifest: LessonManifest, bytes: number): LessonSummary {
  return {
    id: manifest.id,
    title: manifest.title,
    description: manifest.description,
    level: manifest.level,
    createdAt: manifest.createdAt,
    length: playableDuration(keptStretches(manifest)),
    chapters: manifest.states.map(({ time, title }) => ({ time, title })),
    completed: manifest.completed,
    hasCamera: manifest.cameraType !== undefined,
    bytes,
  };
}

export const newestFirst = (a: LessonSummary, b: LessonSummary) =>
  b.createdAt.localeCompare(a.createdAt);

/** Matches the query against title, description and chapter names. */
export function matches(summary: LessonSummary, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === '') return true;
  return [summary.title, summary.description, ...summary.chapters.map((c) => c.title)]
    .join('\n')
    .toLocaleLowerCase()
    .includes(needle);
}

export const LEVELS: readonly LessonLevel[] = ['beginner', 'intermediate', 'advanced'];

export const levelWord = (level: LessonLevel | undefined): string =>
  level === undefined ? 'Any level' : level.charAt(0).toUpperCase() + level.slice(1);

/** Megabytes with one decimal, or kilobytes below one. */
export function sizeWords(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} kB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}
