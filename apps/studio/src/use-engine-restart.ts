/**
 * Handles a geometry engine restart after a crash. The old engine's shapes are gone, so the rebuild
 * cache and drawings made from them are dropped and the open model is rebuilt. Otherwise a model
 * stayed on screen with nothing behind it, and later opens and exports found no solid.
 */
import { RebuildCache } from '@bezier/core';
import { type MutableRefObject, useRef } from 'react';
import type { Session, SessionDeps } from './session.js';
import type { Run } from './use-run.js';

/** A ref the boot hook calls on restart; it always runs the latest handler. */
export function useEngineRestart(
  depsRef: MutableRefObject<SessionDeps | null>,
  sessionRef: MutableRefObject<Session | null>,
  run: Run,
): MutableRefObject<() => void> {
  const ref = useRef<() => void>(() => undefined);
  ref.current = () => {
    const engine = depsRef.current;
    if (engine?.cache !== undefined) engine.cache = new RebuildCache();
    const session = sessionRef.current;
    if (session === null) return;
    session.engineReplaced();
    void run((open) => open.rebuild());
  };
  return ref;
}
