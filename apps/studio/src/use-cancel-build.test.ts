import { RebuildCache } from '@bezier/core';
import { describe, expect, it, vi } from 'vitest';
import { ModelLock } from './model-lock.js';
import type { SessionDeps } from './session.js';
import { cancelBuild } from './use-cancel-build.js';

function engine(cancel: (() => void) | undefined) {
  const cache = new RebuildCache();
  const deps = { kernel: cancel === undefined ? {} : { cancel }, cache } as unknown as SessionDeps;
  return { deps, cache };
}

describe('Escape while the model is building', () => {
  it('stops the engine, drops what it held and remembers that the change was stopped', () => {
    const cancel = vi.fn();
    const { deps, cache } = engine(cancel);
    const lock = new ModelLock();
    const release = lock.hold();
    expect(cancelBuild(deps, lock)).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(deps.cache).not.toBe(cache);
    release();
    expect(lock.takeCancel()).toBe(true);
    // Said once: the next change is not mistaken for the stopped one.
    expect(lock.takeCancel()).toBe(false);
  });

  it('does nothing when nothing is building', () => {
    const cancel = vi.fn();
    const { deps, cache } = engine(cancel);
    const lock = new ModelLock();
    expect(cancelBuild(deps, lock)).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
    expect(deps.cache).toBe(cache);
    expect(lock.takeCancel()).toBe(false);
  });

  it('leaves an engine that cannot be stopped alone, so Escape does its other jobs', () => {
    const { deps } = engine(undefined);
    const lock = new ModelLock();
    lock.hold();
    expect(cancelBuild(deps, lock)).toBe(false);
    expect(lock.takeCancel()).toBe(false);
  });
});
