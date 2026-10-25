/**
 * The editor's `LessonHost` for `@bezier/lessons`: the model as text, edit events, the canvas to
 * record, and checkpoints shown or opened as projects. Reads through refs so the Lessons app
 * created at startup always sees the current editor.
 */

import { parseProjectFile } from '@bezier/core';
import { type ColorScheme, createLessons, type LessonHost, type Lessons } from '@bezier/lessons';
import { type MutableRefObject, useEffect, useRef, useState } from 'react';
import { live } from './automation/live.js';
import { tellIsland } from './island/island-feed.js';
import { nib } from './nib.js';
import { saveProjectThumbnail } from './project-thumbnail.js';
import { Session, type SessionDeps, type SessionView } from './session.js';
import type { ViewportHandle } from './Viewport.js';
import type { StudioMode } from './workspaces/WorkspaceModes.js';

export interface LessonsHostDeps {
  sessionRef: MutableRefObject<Session | null>;
  viewportRef: MutableRefObject<ViewportHandle | null>;
  depsRef: MutableRefObject<SessionDeps | null>;
  view: SessionView | null;
  setView: (view: SessionView) => void;
  setWorkspace: (workspace: StudioMode) => void;
  /** Show or leave the start page. */
  openProjects: (open: boolean) => void;
  /** Reloads the project list after a project was created. */
  refreshProjects: (changed?: string) => void;
}

export interface LessonsHandle {
  lessons: Lessons;
  /** Incremented each time Lessons asks to be shown; the start page opens on Learn. */
  learnRequest: number;
  /**
   * Opens project text as a new project of the user's. Used by a plugin's `project:create`; never
   * replaces an existing project.
   */
  openAsProject: (project: string, name: string) => Promise<void>;
}

const darkQuery = () => matchMedia('(prefers-color-scheme: dark)');

function scheme(): ColorScheme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'dark' || chosen === 'light') return chosen;
  return darkQuery().matches ? 'dark' : 'light';
}

export function useLessons(deps: LessonsHostDeps): LessonsHandle {
  const latest = useRef(deps);
  latest.current = deps;
  live.sessionRef = deps.sessionRef;
  live.viewportRef = deps.viewportRef;
  live.view = deps.view;
  const [learnRequest, setLearnRequest] = useState(0);
  // Edit listeners follow whichever session is open (see the effect below).
  const editListeners = useRef(new Set<Parameters<LessonHost['onEdit']>[0]>());
  const shown = useRef(0);

  const [lessons] = useState(() => {
    const needDeps = () => {
      const found = latest.current.depsRef.current;
      if (found === null) throw new Error('The modelling engine is still starting.');
      return found;
    };
    /** Makes `session` the open one, drawn, in the design workspace. */
    const adopt = async (session: Session) => {
      const next = await session.rebuild();
      const now = latest.current;
      now.sessionRef.current = session;
      now.setView(next);
      now.setWorkspace('design');
      now.openProjects(false);
    };

    const host: LessonHost = {
      snapshot: async () => {
        const session = latest.current.sessionRef.current;
        return session === null ? null : JSON.stringify(session.document);
      },
      onEdit: (listener) => {
        editListeners.current.add(listener);
        return () => editListeners.current.delete(listener);
      },
      showState: async (project, title, context) => {
        // Called repeatedly as the video passes checkpoints; only the latest counts.
        const ticket = ++shown.current;
        const session = Session.lessonPreview(project, needDeps(), title);
        session.lessonProject = context ?? null;
        const next = await session.rebuild();
        if (ticket !== shown.current) return;
        const now = latest.current;
        now.sessionRef.current = session;
        now.setView(next);
        now.setWorkspace('design');
      },
      newProject: async (name) => {
        await adopt(await Session.create(`doc-${Date.now()}`, name, needDeps()));
        latest.current.refreshProjects();
      },
      viewport: () => {
        if (latest.current.sessionRef.current === null) return null;
        const canvas = document.querySelector<HTMLCanvasElement>('canvas.viewport');
        const element = document.querySelector<HTMLElement>('.workspace .stage');
        return canvas === null ? null : { canvas, element: element ?? canvas };
      },
      // Unconditional: following along brings its own model (`showState`), so the editor may be
      // requested before any project is open.
      showEditor: () => latest.current.openProjects(false),
      showLessons: () => {
        shown.current += 1;
        const now = latest.current;
        const session = now.sessionRef.current;
        const viewport = now.viewportRef.current;
        const engine = now.depsRef.current;
        if (session !== null && viewport !== null && engine !== null && !session.isLessonPreview)
          void saveProjectThumbnail(session, viewport, engine)
            .then(() => now.refreshProjects(session.id))
            .catch(() => undefined);
        latest.current.openProjects(true);
        setLearnRequest((count) => count + 1);
      },
      colorScheme: scheme,
      onColorScheme: (listener) => {
        const tell = () => listener(scheme());
        const observer = new MutationObserver(tell);
        observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
        const query = darkQuery();
        query.addEventListener('change', tell);
        return () => {
          observer.disconnect();
          query.removeEventListener('change', tell);
        };
      },
      reducedMotion: () => {
        const chosen = document.documentElement.dataset.motion;
        if (chosen === 'reduced') return true;
        if (chosen === 'full') return false;
        return matchMedia('(prefers-reduced-motion: reduce)').matches;
      },
    };
    return createLessons(host);
  });

  // Move the edit listeners to the new session when it changes.
  const session = deps.view === null ? null : deps.sessionRef.current;
  useEffect(() => {
    if (session === null) return;
    return session.onEdit((edit) => {
      // Nib's guided lessons wait for edits by journal operation only.
      const heard = {
        kind: 'edit',
        op: edit.operation.op,
        ...(edit.operation.op === 'addFeature' ? { type: edit.operation.type } : {}),
      } as const;
      nib.notify(heard, performance.now() / 1000);
      tellIsland(heard);
      for (const listener of editListeners.current) {
        listener({
          title: edit.description,
          operation: edit.operation,
          project: JSON.stringify(edit.document),
        });
      }
    });
  }, [session]);

  useEffect(() => {
    const context = session?.lessonProject;
    if (session === null || session.isLessonPreview || context == null) return;
    let active = true;
    void lessons
      .load(context.lesson)
      .then((lesson) => {
        if (!active) return;
        latest.current.setWorkspace('design');
        lessons.state.update((state) => ({
          ...state,
          following: { lesson, at: context.at, preserveModel: true },
        }));
      })
      .catch((problem: unknown) => {
        if (active)
          lessons.notify(
            problem instanceof Error
              ? problem.message
              : 'The linked lesson is unavailable on this device.',
            { sticky: true, over: 'editor' },
          );
      });
    return () => {
      active = false;
    };
  }, [session, lessons]);

  const [openAsProject] = useState(() => async (project: string, name: string) => {
    const found = latest.current.depsRef.current;
    if (found === null) throw new Error('The modelling engine is still starting.');
    const parsed = parseProjectFile(project);
    const id = `doc-${Date.now()}`;
    const title = name.trim() === '' ? parsed.meta.name : name.trim();
    await found.store.importProject(id, { ...parsed, meta: { ...parsed.meta, name: title } });
    const session = await Session.open(id, found);
    const next = await session.rebuild();
    const now = latest.current;
    now.sessionRef.current = session;
    now.setView(next);
    now.setWorkspace('design');
    now.openProjects(false);
    now.refreshProjects(id);
  });

  return { lessons, learnRequest, openAsProject };
}
