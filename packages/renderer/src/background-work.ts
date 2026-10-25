/**
 * Deferrable viewport work (e.g. level-of-detail measurement and requests, `lod-body.ts`), run in
 * slices of a few milliseconds between frames while the camera is still and there is spare time
 * (`FrameBudget.spare`). Camera movement pauses it without discarding anything. A piece of work is
 * a generator that yields wherever it may be interrupted.
 */

/** How long one frame may give to background work, in milliseconds. */
export const SLICE_MS = 4;

export type Work = Iterator<unknown, unknown, undefined>;

export class BackgroundWork {
  readonly #queue: Work[] = [];

  /** Queue `work`; the function returned drops it, done or not. */
  add(work: Work): () => void {
    this.#queue.push(work);
    return () => {
      const at = this.#queue.indexOf(work);
      if (at !== -1) this.#queue.splice(at, 1);
    };
  }

  get pending(): boolean {
    return this.#queue.length > 0;
  }

  /** Run queued work, oldest first, until `until` (a `performance.now()` time). */
  run(until: number, now: () => number = () => performance.now()): void {
    while (this.#queue.length > 0 && now() < until) {
      const work = this.#queue[0];
      if (work === undefined) return;
      let done = false;
      try {
        done = work.next().done === true;
      } catch (problem) {
        // A failed piece of background work costs its own result, never the view.
        console.error('Background work failed', problem);
        done = true;
      }
      if (done && this.#queue[0] === work) this.#queue.shift();
    }
  }

  clear(): void {
    this.#queue.length = 0;
  }
}
