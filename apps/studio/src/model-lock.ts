/**
 * One model change at a time. The session already serialises work, but a command clicked during a
 * multi-second rebuild would run later against a model the user had not seen yet. So a command that
 * arrives while another is building is refused with a reason instead of queued.
 *
 * Counted rather than a flag: an import holds it while reading the file and then hands over to the
 * change that builds it, and neither may release the other's hold.
 */

import type { RailGroup, RailItem } from '@bezier/ui';
import { useEffect, useMemo, useState } from 'react';

/** Message shown for every refused command. */
export const MODEL_BUSY_MESSAGE = 'Still updating the model. Try again in a moment.';

/** Rail commands that only inspect the model and stay usable while it builds. */
const LOOK_ONLY: ReadonlySet<string> = new Set(['items', 'section', 'measure']);

/** How long a change runs before the rail shows it is busy. */
const SHOW_AFTER_MS = 250;

export class ModelLock {
  #holds = 0;
  readonly #listeners = new Set<(held: boolean) => void>();
  /** Set when the user asked to stop the running change; read and cleared by its owner. */
  #cancelRequested = false;
  /** Pending holds, first come first served. */
  readonly #waiting: (() => void)[] = [];

  /** Marks the running change as cancelled on request, so its owner can roll it back. */
  requestCancel(): void {
    if (this.held) this.#cancelRequested = true;
  }

  /** Whether the change that just ended was cancelled on request; clears the flag. */
  takeCancel(): boolean {
    const was = this.#cancelRequested;
    this.#cancelRequested = false;
    return was;
  }

  get held(): boolean {
    return this.#holds > 0;
  }

  /** Takes the lock, or returns null when a change is already running. */
  tryHold(): (() => void) | null {
    if (this.held) return null;
    return this.hold();
  }

  /**
   * Takes the lock as soon as it is free. For input typed into a panel (a value, a name, a
   * variable), which would be lost if refused.
   */
  acquire(): Promise<() => void> {
    const now = this.tryHold();
    if (now !== null) return Promise.resolve(now);
    return new Promise((resolve) => this.#waiting.push(() => resolve(this.hold())));
  }

  /**
   * Takes the lock whether or not it is held, for work that belongs to a running change (e.g. the
   * undo the history keys start). The returned release only works once, so a repeated `finally`
   * cannot free another hold.
   */
  hold(): () => void {
    this.#holds += 1;
    if (this.#holds === 1) this.#emit();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#holds -= 1;
      if (this.#holds > 0) return;
      const next = this.#waiting.shift();
      // Hand over directly so nothing can start in between.
      if (next !== undefined) next();
      else this.#emit();
    };
  }

  subscribe(listener: (held: boolean) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(): void {
    for (const listener of this.#listeners) listener(this.held);
  }
}

/** Whether a rail command may start while the model is building. */
export function allowedWhileBuilding(id: string): boolean {
  return LOOK_ONLY.has(id);
}

/** The rail with every model-changing command disabled, with a reason. */
export function lockRail(groups: readonly RailGroup[]): readonly RailGroup[] {
  const lock = (item: RailItem): RailItem => ({
    ...item,
    ...(allowedWhileBuilding(item.id)
      ? {}
      : { disabled: true, disabledReason: 'Waiting for the model to finish updating' }),
    ...(item.flyout === undefined ? {} : { flyout: item.flyout.map(lock) }),
  });
  return groups.map((group) => ({ ...group, items: group.items.map(lock) }));
}

/**
 * The app's lock, and whether a change has run long enough to show. Quick changes finish within a
 * frame or two, so the rail only greys out after `SHOW_AFTER_MS` to avoid flicker. Refusal itself
 * is immediate.
 */
export function useModelLock(): { lock: ModelLock; showing: boolean } {
  const lock = useMemo(() => new ModelLock(), []);
  const [showing, setShowing] = useState(false);
  useEffect(() => {
    let timer: number | undefined;
    const root = window.document.documentElement;
    const unsubscribe = lock.subscribe((held) => {
      // Set synchronously, not through React: a gizmo handle grabbed before the rail greys out
      // would otherwise preview a change whose commit is refused, leaving the preview on screen.
      // The stylesheet disables pointer events on handles from this attribute.
      root.toggleAttribute('data-model-locked', held);
      window.clearTimeout(timer);
      if (held) timer = window.setTimeout(() => setShowing(true), SHOW_AFTER_MS);
      else setShowing(false);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      root.removeAttribute('data-model-locked');
    };
  }, [lock]);
  useEffect(() => {
    // For the stylesheet: handles already ignoring the pointer now also fade.
    window.document.documentElement.toggleAttribute('data-model-busy', showing);
  }, [showing]);
  return { lock, showing };
}
