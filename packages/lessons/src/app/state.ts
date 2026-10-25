/**
 * State shared by the Lessons surfaces: the home screen, the lesson being followed, the active
 * recording and the notice line. None of it lives in the editor.
 */

import type { StoredLesson } from '../format/manifest.js';
import type { RecordingSession } from '../record/recorder.js';

export type Screen =
  | { kind: 'list' }
  | { kind: 'player'; id: string; at?: number }
  | { kind: 'edit'; id: string };

export interface Notice {
  key: number;
  text: string;
  detail?: string;
  tone: 'info' | 'ok' | 'fail';
  /** Stays until the user dismisses it. */
  sticky: boolean;
  /** The surface that shows it: the home, or the overlay above the editor. */
  over: 'home' | 'editor';
}

export interface Following {
  lesson: StoredLesson;
  /** Lesson time to start from. */
  at: number;
  /** A saved learner project must never be replaced by a recorded checkpoint on open. */
  preserveModel?: boolean;
}

export interface LessonsState {
  screen: Screen;
  following: Following | null;
  recording: RecordingSession | null;
  /** A recording is being set up (permissions, project). */
  starting: boolean;
  notice: Notice | null;
  /** Bumped whenever a lesson is stored or deleted, so lists reload. */
  libraryVersion: number;
}

export const initialState: LessonsState = {
  screen: { kind: 'list' },
  following: null,
  recording: null,
  starting: false,
  notice: null,
  libraryVersion: 0,
};
