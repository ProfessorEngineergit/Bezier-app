/**
 * Escape while the model builds. The engine cannot abort a call, so the worker is terminated and a
 * fresh one starts on the next call (`WorkerSupervisor.cancel`). Its shapes are lost, so the
 * rebuild cache is replaced, the change in flight is reverted by its runner (`useRun`) and the
 * model is rebuilt from its journal.
 */

import { RebuildCache } from '@bezier/core';
import { type MutableRefObject, useCallback } from 'react';
import type { ModelLock } from './model-lock.js';
import type { SessionDeps } from './session.js';

/** The logic without the hook, for tests. */
export function cancelBuild(engine: SessionDeps | null, lock: ModelLock): boolean {
  // An in-page engine, as in tests, cannot be stopped.
  if (!lock.held || engine === null || engine.kernel.cancel === undefined) return false;
  lock.requestCancel();
  if (engine.cache !== undefined) engine.cache = new RebuildCache();
  engine.kernel.cancel();
  return true;
}

export function useCancelBuild(
  depsRef: MutableRefObject<SessionDeps | null>,
  lock: ModelLock,
): () => boolean {
  return useCallback(() => cancelBuild(depsRef.current, lock), [depsRef, lock]);
}
