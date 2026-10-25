import { RebuildCache } from '@bezier/core';
import { type MutableRefObject, useCallback, useRef, useState } from 'react';
import type { DocumentInfo } from './boot.js';
import { beginLoading, finishLoading, finishLoadingAfterPaint } from './boot-loader.js';
import { saveAsProject } from './lesson-project.js';
import { lastOpenTook, openFraction, rememberOpenTook } from './open-estimate.js';
import type { Said } from './said.js';
import type { SessionDeps, SessionView } from './session.js';
import { Session } from './session.js';
import { documentWeight, SessionKeep } from './session-keep.js';
import { traced } from './trace.js';
import { useRecoveredNotice } from './use-recovered.js';
import type { TaskHandle, TasksHandle } from './use-tasks.js';

/**
 * How long the projects stay on screen after one is chosen. A small project opens within this and
 * the editor appears with its model; past it the editor and loading screen appear together (audit
 * A3).
 */
const SWITCH_DELAY_MS = 150;

interface Deps {
  depsRef: MutableRefObject<SessionDeps | null>;
  sessionRef: MutableRefObject<Session | null>;
  tasksRef: MutableRefObject<TasksHandle | null>;
  say: (message: string | Said) => void;
  setView: (view: SessionView | null) => void;
  setBusy: (busy: boolean) => void;
}

export interface DashboardHandle {
  documents: readonly DocumentInfo[];
  setDocuments: (docs: readonly DocumentInfo[]) => void;
  dashboardOpen: boolean;
  setDashboardOpen: (open: boolean) => void;
  openDocument: (id: string) => void;
  /** The project being opened, named in the title bar above the loader. */
  opening: { id: string; name: string } | null;
  /**
   * Abandons the project being opened and returns to the projects. False when nothing is opening.
   * The engine finishes its current work and the result is dropped.
   */
  cancelOpening: () => boolean;
  newDocument: () => void;
  /** Copies a lesson's project to an ordinary project (lesson-project.ts). */
  saveAsProject: (id: string) => Promise<boolean>;
  deleteDocument: (id: string) => Promise<boolean>;
}

export function useDashboard(deps: Deps): DashboardHandle {
  const { depsRef, sessionRef, tasksRef, say, setView, setBusy } = deps;
  // Shown after the shell reloaded a page whose process died.
  useRecoveredNotice(say);
  const [documents, setDocuments] = useState<readonly DocumentInfo[]>([]);
  // Always start on the projects, never in the last project.
  const [dashboardOpen, setDashboardOpen] = useState(true);
  const [opening, setOpening] = useState<{ id: string; name: string } | null>(null);
  /** Recently closed projects, kept in memory. */
  const kept = useRef(new SessionKeep());
  /** Counts opens, so an abandoned one cannot land later. */
  const request = useRef(0);
  /**
   * Title-bar progress for the open in flight. Delayed like the loader so fast opens do not flash a
   * bar; fills against the previous open's duration when known.
   */
  const openingBar = useRef<{ timer: number; tick?: number; bar?: TaskHandle } | null>(null);
  /** The open in flight: the timer that shows the editor, and whether the loader came with it. */
  const switching = useRef<{ timer: number; shown: boolean } | null>(null);
  const endOpeningBar = useCallback(() => {
    const current = openingBar.current;
    if (current === null) return;
    window.clearTimeout(current.timer);
    window.clearInterval(current.tick);
    current.bar?.done();
    openingBar.current = null;
  }, []);
  /** Stops the pending switch; true when the loading screen was shown and must be hidden. */
  const endSwitching = useCallback((): boolean => {
    const current = switching.current;
    if (current === null) return false;
    window.clearTimeout(current.timer);
    switching.current = null;
    return current.shown;
  }, []);

  const openDocument = useCallback(
    (id: string) => {
      const d = depsRef.current;
      if (d === null) return;
      const mine = ++request.current;
      const current = () => request.current === mine;
      setBusy(true);
      // A recently closed project is reused as it was, history included (`session-keep.ts`, audit
      // F-062); reading the Voron journal again took 2 to 4 s. The open project is kept in turn. A
      // kept project renamed or deleted meanwhile is read again.
      const previous = sessionRef.current;
      if (previous !== null && previous.id !== id) kept.current.keep(previous);
      const listed = documents.find((doc) => doc.id === id);
      const taken = kept.current.take(id) ?? (previous?.id === id ? previous : null);
      const again =
        taken !== null && listed !== undefined && taken.document.meta.name === listed.name
          ? taken
          : null;
      // Release the open project now: anything still reaching it (Export, a thumbnail on the way
      // home) would act on the wrong project.
      sessionRef.current = null;
      setView(null);
      setOpening({ id, name: documents.find((doc) => doc.id === id)?.name ?? 'Untitled' });
      // Switch to the editor under its title bar, so Home is reachable while a large model loads,
      // but only once there is a loading screen over it. A small project lands before this runs.
      endSwitching();
      const switchTimer = window.setTimeout(() => {
        if (!current() || switching.current === null) return;
        switching.current.shown = true;
        setDashboardOpen(false);
        beginLoading({ belowBar: true, immediate: true });
      }, SWITCH_DELAY_MS);
      switching.current = { timer: switchTimer, shown: false };
      endOpeningBar();
      const pending: { timer: number; tick?: number; bar?: TaskHandle } = { timer: 0 };
      const began = performance.now();
      const expected = lastOpenTook(id);
      pending.timer = window.setTimeout(() => {
        const bar = tasksRef.current?.begin('Opening project');
        if (bar === undefined) return;
        pending.bar = bar;
        // With a previous duration, the bar shows progress (open-estimate.ts).
        if (expected === null) return;
        // Labelled as an estimate: elapsed time against last time, not counted work.
        const show = () =>
          bar.progress(openFraction(performance.now() - began, expected), { phase: 'Estimated' });
        show();
        pending.tick = window.setInterval(show, 200);
      }, SWITCH_DELAY_MS);
      openingBar.current = pending;
      (again === null ? traced('open', () => Session.open(id, d)) : Promise.resolve(again))
        .then(async (session) => {
          if (!current()) return;
          const view = await session.rebuild();
          if (!current()) return;
          rememberOpenTook(id, performance.now() - began);
          sessionRef.current = session;
          kept.current.fit(documentWeight(session.document));
          setView(view);
          // Landed before the editor was shown: show it now with the model, in the same render that
          // clears `opening`.
          setDashboardOpen(false);
          setOpening(null);
          setBusy(false);
        })
        .catch((error: unknown) => {
          if (!current()) return;
          say(error instanceof Error ? error.message : String(error));
          setDashboardOpen(true);
        })
        .finally(() => {
          // Abandoned: `cancelOpening` has already restored everything.
          if (!current()) return;
          endOpeningBar();
          const shown = endSwitching();
          setOpening(null);
          setBusy(false);
          if (shown) finishLoadingAfterPaint();
        });
    },
    [depsRef, sessionRef, tasksRef, say, setView, setBusy, documents, endOpeningBar, endSwitching],
  );

  const cancelOpening = useCallback((): boolean => {
    if (opening === null) return false;
    request.current += 1;
    // Stop the engine instead of letting it finish: reading a large project can take minutes, and
    // everything after Home (the next project, a card picture) would wait behind it. Its kept
    // projects (`session-keep.ts`) and rebuild cache go with it.
    const engine = depsRef.current;
    if (engine !== null && engine.kernel.cancel !== undefined) {
      if (engine.cache !== undefined) engine.cache = new RebuildCache();
      kept.current = new SessionKeep();
      engine.kernel.cancel();
    }
    endOpeningBar();
    const shown = endSwitching();
    setOpening(null);
    setBusy(false);
    setDashboardOpen(true);
    if (shown) finishLoading();
    return true;
  }, [opening, depsRef, setBusy, endOpeningBar, endSwitching]);

  const newDocument = useCallback(() => {
    const d = depsRef.current;
    if (d === null) return;
    setBusy(true);
    beginLoading();
    const id = `doc-${Date.now()}`;
    const previous = sessionRef.current;
    if (previous !== null) kept.current.keep(previous);
    Session.create(id, 'Untitled', d)
      .then(async (session) => {
        sessionRef.current = session;
        kept.current.fit(documentWeight(session.document));
        setView(await session.rebuild());
        setDocuments(await d.store.listDocuments());
        setDashboardOpen(false);
      })
      .catch((error: unknown) => say(error instanceof Error ? error.message : String(error)))
      .finally(() => {
        setBusy(false);
        finishLoadingAfterPaint();
      });
  }, [depsRef, sessionRef, say, setView, setBusy]);

  const deleteDocument = useCallback(
    async (id: string): Promise<boolean> => {
      const d = depsRef.current;
      if (d === null) return false;
      try {
        await d.store.deleteDocument(id);
        kept.current.forget(id);
        setDocuments(await d.store.listDocuments());
        return true;
      } catch (error: unknown) {
        say(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [depsRef, say],
  );

  const saveCopy = useCallback(
    async (id: string): Promise<boolean> => {
      const d = depsRef.current;
      if (d === null) return false;
      try {
        await saveAsProject(d.store, id);
        setDocuments(await d.store.listDocuments());
        return true;
      } catch (error: unknown) {
        say(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [depsRef, say],
  );

  return {
    saveAsProject: saveCopy,
    documents,
    setDocuments,
    dashboardOpen,
    setDashboardOpen,
    openDocument,
    opening,
    cancelOpening,
    newDocument,
    deleteDocument,
  };
}
