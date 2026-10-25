import { useCallback, useEffect, useRef, useState } from 'react';
import { useLessons } from '../app/context.js';
import type { LessonManifest } from '../format/manifest.js';
import { createHistory } from './history.js';

export type Saved = 'saved' | 'saving' | 'failed';

type Edit = (manifest: LessonManifest) => LessonManifest;

/**
 * The manifest being edited, with undo. Saves are debounced and flushed when the view closes,
 * since each save rewrites the lesson's whole row including media. Changes sharing a `group` merge
 * into one undo step (see `history.ts`).
 */
export function useManifestEdits(initial: LessonManifest) {
  const lessons = useLessons();
  const [manifest, setManifest] = useState(initial);
  const [saved, setSaved] = useState<Saved>('saved');
  const pending = useRef<LessonManifest | null>(null);
  const timer = useRef(0);
  const history = useRef(createHistory(initial));
  const [depth, setDepth] = useState({ undo: false, redo: false });

  const flush = useCallback((): Promise<void> => {
    window.clearTimeout(timer.current);
    const next = pending.current;
    if (next === null) return Promise.resolve();
    pending.current = null;
    setSaved('saving');
    return lessons
      .saveManifest(next)
      .then(() => {
        if (pending.current === null) setSaved('saved');
      })
      .catch((problem: unknown) => {
        setSaved('failed');
        lessons.complain(problem, 'The changes could not be saved.');
      });
  }, [lessons]);

  const show = useCallback(
    (next: LessonManifest) => {
      setManifest(next);
      pending.current = next;
      setSaved('saving');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 600);
      setDepth({ undo: history.current.canUndo, redo: history.current.canRedo });
    },
    [flush],
  );

  const change = useCallback(
    (edit: Edit, group?: string) => {
      const current = history.current.current;
      const next = edit(current);
      if (next === current) return;
      history.current.push(next, group, performance.now());
      show(next);
    },
    [show],
  );

  const undo = useCallback(() => {
    if (history.current.canUndo) show(history.current.undo());
  }, [show]);
  const redo = useCallback(() => {
    if (history.current.canRedo) show(history.current.redo());
  }, [show]);

  useEffect(() => () => void flush(), [flush]);

  return {
    manifest,
    change,
    saved,
    flush,
    undo,
    redo,
    canUndo: depth.undo,
    canRedo: depth.redo,
  };
}
