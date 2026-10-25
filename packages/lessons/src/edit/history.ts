/**
 * Undo history for the edit view, kept pure so its step rules are testable. Used by
 * `useManifestEdits.ts`.
 *
 * Consecutive changes with the same `group` within `GESTURE_GAP` merge into one step, so undoing a
 * drag restores the state from before the drag began.
 */

/** Changes of one gesture closer together than this (ms) merge into one step. */
export const GESTURE_GAP = 900;
/** Maximum undo steps; each holds a whole manifest. */
const DEPTH = 100;

interface Entry<T> {
  value: T;
  group: string | undefined;
  at: number;
}

export interface History<T> {
  readonly current: T;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** `group` names the gesture; `now` is the current time in ms. */
  push(value: T, group: string | undefined, now: number): void;
  /** Returns the state before the last step, or the current one when there is none. */
  undo(): T;
  redo(): T;
}

export function createHistory<T>(initial: T): History<T> {
  let past: Entry<T>[] = [];
  let future: Entry<T>[] = [];
  let last: Entry<T> = { value: initial, group: undefined, at: 0 };
  return {
    get current() {
      return last.value;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    push(value, group, now) {
      const continuing = group !== undefined && last.group === group && now - last.at < GESTURE_GAP;
      // The first change of a gesture records the state before it.
      if (!continuing) {
        past = [...past, last].slice(-DEPTH);
        future = [];
      }
      last = { value, group, at: now };
    },
    undo() {
      const before = past.at(-1);
      if (before === undefined) return last.value;
      past = past.slice(0, -1);
      future = [...future, last];
      last = { value: before.value, group: undefined, at: 0 };
      return last.value;
    },
    redo() {
      const after = future.at(-1);
      if (after === undefined) return last.value;
      future = future.slice(0, -1);
      past = [...past, last];
      last = { value: after.value, group: undefined, at: 0 };
      return last.value;
    },
  };
}
