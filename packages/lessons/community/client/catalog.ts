/**
 * The community catalogue: a server's list of its lessons.
 *
 * Servers are untrusted, so everything is validated here before use: ids become URLs, sizes become
 * download limits, and text is rendered.
 */

import type { LessonLevel } from '../../src/format/manifest.js';
import { ID_PATTERN, LIMITS, SHA256_PATTERN } from './limits.js';

export interface CatalogEntry {
  id: string;
  title: string;
  description: string;
  level?: LessonLevel;
  /** Seconds. */
  duration: number;
  /** Number of checkpoints. */
  chapters: number;
  /** Package size in bytes. */
  size: number;
  /** SHA-256 of the package in lower-case hex; downloads are checked against it. */
  sha256: string;
  /** ISO 8601. */
  createdAt: string;
  /** The uploader's name as assigned by the server owner, not taken from the file. */
  author: string;
}

export interface CatalogPage {
  lessons: CatalogEntry[];
  /** Cursor for the next page; absent on the last. */
  next?: string;
}

const LEVELS: readonly string[] = ['beginner', 'intermediate', 'advanced'];

const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;

const count = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;

export function isCatalogEntry(value: unknown): value is CatalogEntry {
  if (value === null || typeof value !== 'object') return false;
  const e = value as Partial<Record<keyof CatalogEntry, unknown>>;
  return (
    typeof e.id === 'string' &&
    ID_PATTERN.test(e.id) &&
    typeof e.sha256 === 'string' &&
    SHA256_PATTERN.test(e.sha256) &&
    text(e.title, LIMITS.title) &&
    text(e.description, LIMITS.description) &&
    (e.level === undefined || (typeof e.level === 'string' && LEVELS.includes(e.level))) &&
    typeof e.duration === 'number' &&
    Number.isFinite(e.duration) &&
    e.duration >= 0 &&
    e.duration <= LIMITS.durationSeconds &&
    count(e.chapters, LIMITS.states) &&
    count(e.size, LIMITS.packageBytes) &&
    text(e.createdAt, 40) &&
    text(e.author, 80)
  );
}

export function isCatalogPage(value: unknown): value is CatalogPage {
  if (value === null || typeof value !== 'object') return false;
  const page = value as Partial<Record<keyof CatalogPage, unknown>>;
  return (
    Array.isArray(page.lessons) &&
    page.lessons.length <= 100 &&
    page.lessons.every(isCatalogEntry) &&
    (page.next === undefined || text(page.next, 64))
  );
}
