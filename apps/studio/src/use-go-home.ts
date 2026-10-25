/**
 * Leaving a project, capturing its card picture on the way out (default view, framed, card aspect;
 * `card-shot.ts`). Navigation does not wait for the capture, and a failure is ignored: the card
 * keeps its previous picture.
 */

import type { Lessons } from '@bezier/lessons';
import type { MutableRefObject } from 'react';
import { useCallback } from 'react';
import { askQuestion } from './ask-question.js';
import { endLoadingNow } from './boot-loader.js';
import type { ModelLock } from './model-lock.js';
import { saveProjectThumbnail } from './project-thumbnail.js';
import type { Session, SessionDeps } from './session.js';
import type { ViewportHandle } from './Viewport.js';

export interface GoHomeDeps {
  viewportRef: MutableRefObject<ViewportHandle | null>;
  sessionRef: MutableRefObject<Session | null>;
  depsRef: MutableRefObject<SessionDeps | null>;
  /** Reloads the library so the new picture shows. */
  refresh: (changed?: string) => void;
  openProjects: (open: boolean) => void;
}

export function useGoHome({
  viewportRef,
  sessionRef,
  depsRef,
  refresh,
  openProjects,
}: GoHomeDeps): () => void {
  return useCallback(() => {
    const viewport = viewportRef.current;
    const session = sessionRef.current;
    const id = session?.id;
    const store = depsRef.current?.store;
    // A new project left unchanged is discarded, not kept as an empty "Untitled".
    if (session?.isLessonPreview === true) {
      // A thumbnail alone would create a phantom project for a checkpoint that was only viewed.
      openProjects(true);
      return;
    }
    if (session?.untouched === true && id !== undefined && store !== undefined) {
      void store
        .deleteDocument(id)
        .then(() => refresh())
        .catch(() => undefined);
    } else if (
      viewport !== null &&
      session !== null &&
      id !== undefined &&
      depsRef.current !== null
    ) {
      void saveProjectThumbnail(session, viewport, depsRef.current)
        .then(() => refresh(id))
        .catch(() => undefined);
    }
    // No loading screen over the projects.
    endLoadingNow();
    openProjects(true);
  }, [viewportRef, sessionRef, depsRef, refresh, openProjects]);
}

/**
 * Home from anywhere in the editor: an open in flight is abandoned, a lesson is left through the
 * lesson, and a sketch in progress is kept (as when leaving sketch mode otherwise), which also
 * keeps a new project from being discarded as untouched. The sketch write is queued on the model
 * lock and Home follows it.
 */
export function useHomeWhileIdle({
  goHome,
  cancelOpening,
  lessons,
  lock,
  leaveSketch,
  importing,
  cancelImport,
  keepProject,
}: {
  goHome: () => void;
  /** True when an open was in flight and has been abandoned. */
  cancelOpening: () => boolean;
  lessons: Lessons;
  lock: ModelLock;
  /** Finishes the sketch in progress; returns whether there was one. */
  leaveSketch: MutableRefObject<() => boolean>;
  /** Whether a model is currently being read or built into the project. */
  importing: () => boolean;
  /** Abandons that model. */
  cancelImport: () => void;
  /** Marks the project non-empty while a model is coming in, so it is not discarded. */
  keepProject: () => void;
}): () => void {
  return useCallback(() => {
    if (cancelOpening()) return;
    const leave = () => {
      if (lessons.state.get().following === null) goHome();
      else lessons.leaveFollow();
    };
    const go = () => {
      if (leaveSketch.current()) void lock.acquire().then((release) => (release(), leave()));
      else leave();
    };
    if (!importing()) {
      go();
      return;
    }
    // A model still loading: Nib asks whether to continue. It lands in this project either way,
    // even if another is open by then (`useRun`), and he says when it is in.
    void askQuestion({
      title: 'A model is still loading',
      message:
        'Keep loading it into this project in the background? I will tell you when it is in, wherever you are.',
      yes: 'Stop loading',
      no: 'Keep loading',
    }).then((stop) => {
      if (stop) cancelImport();
      else keepProject();
      go();
    });
  }, [goHome, cancelOpening, lessons, lock, leaveSketch, importing, cancelImport, keepProject]);
}
