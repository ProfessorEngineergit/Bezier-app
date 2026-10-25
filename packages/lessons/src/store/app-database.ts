/**
 * The Lessons app's own database, separate from the lesson store: summaries, progress, posters and
 * the recording in progress. Not shared with the editor.
 */

import type { DatabaseSpec } from './database.js';

export const APP_DATABASE: DatabaseSpec = {
  name: 'bezier-lessons-app',
  version: 1,
  stores: {
    /** A `LessonSummary` per lesson (src/format/summary.ts). */
    summaries: { keyPath: 'id' },
    /** Playback progress: `{ id, time, updatedAt }`. */
    progress: { keyPath: 'id' },
    /** Card poster frames: `{ id, image }`. */
    posters: { keyPath: 'id' },
    /** The recording in progress: options, events and checkpoints so far. */
    drafts: { keyPath: 'id' },
    /** Media of the recording in progress, one chunk per row, in order. */
    chunks: { autoIncrement: true, indexes: [['draft', 'draft']] },
  },
};
