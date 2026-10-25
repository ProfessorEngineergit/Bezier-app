/**
 * Running editor state for the automation link (link.ts). Settings (`usePrefs`), session and
 * viewport (`useLessons`), workspace (the editor) and sketch (`useSketchMode`) each write their
 * current value here on render, one assignment; answers.ts reads it on demand. A view onto
 * state, never a second copy React renders from.
 */

import type { StableRef } from '@bezier/core';
import type { MutableRefObject } from 'react';
import type { AppPrefs } from '../preferences.js';
import type { Session, SessionView } from '../session.js';
import type { ViewportHandle } from '../Viewport.js';
import type { StudioMode } from '../workspaces/WorkspaceModes.js';

export interface Live {
  prefs: AppPrefs | null;
  setPrefs: ((next: AppPrefs) => void) | null;
  sessionRef: MutableRefObject<Session | null> | null;
  viewportRef: MutableRefObject<ViewportHandle | null> | null;
  view: SessionView | null;
  workspace: StudioMode | null;
  /** A sketch open for drawing, and which stored one is being edited (null for a new one). */
  sketch: { open: boolean; editing: string | null };
  selected: readonly StableRef[];
  say: ((message: string) => void) | null;
}

export const live: Live = {
  prefs: null,
  setPrefs: null,
  sessionRef: null,
  viewportRef: null,
  view: null,
  workspace: null,
  sketch: { open: false, editing: null },
  selected: [],
  say: null,
};
