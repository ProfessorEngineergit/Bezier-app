/**
 * Measures rendering load: the gap between drawn frames, smoothed over about ten frames, against a
 * fixed 60 Hz budget. The overrun is the `pressure` that adaptive features respond to
 * (`interaction-quality.ts`, `solid-lod.ts`, `background-work.ts`), whatever its cause.
 *
 * The budget is fixed rather than measured from the display: under a load that slows everything,
 * idle frames are late too, so a measured refresh drifts up and pressure reads zero. Displays below
 * 60 Hz get lower resolution than they need while moving.
 *
 * Gaps after undrawn frames (`redraw.ts`) do not count towards `pressure` but feed `spare`, which
 * gates background work. Nothing allocates per frame.
 */

/** One frame at 60 Hz, in milliseconds. */
const SIXTY_HZ = 1000 / 60;
/** Smoothing of the frame gap: the weight of the newest frame. */
const WEIGHT = 0.15;
/** Longer than this, two drawn frames were not one run of animation. */
const RUN_GAP_MS = 250;
/** Faster than any display: a gap shorter than this is timer jitter. */
const SHORTEST_MS = 4;
/** Up to this far over the budget is on time: vsync jitter, not load. */
const ON_TIME = 1.12;
/** Frames a resize is given to settle before gaps are measured again. */
const RESIZE_SETTLE_FRAMES = 3;
/** At this far over the budget, pressure is full: half the frames missed. */
const FULL = 2;

export class FrameBudget {
  /** When the loop last ran, and whether it drew then. */
  #last = -1;
  #lastDrew = false;
  #smoothed = SIXTY_HZ;
  #ticks = SIXTY_HZ;
  /** Gaps still to be ignored after the drawing buffer was resized. */
  #ignore = 0;
  /** The frame time being held to, in milliseconds (`interaction-quality.ts` sets it). */
  #target = SIXTY_HZ;

  /** Hold frames to this many milliseconds instead of one at 60 Hz. */
  setTarget(ms: number): void {
    this.#target = ms;
  }

  /** The loop ran at `now` (milliseconds) and drew a frame. */
  drawn(now: number): void {
    this.#tick(now, true);
  }

  /** The loop ran at `now` and had nothing to draw. */
  skipped(now: number): void {
    this.#tick(now, false);
  }

  /**
   * A frame's cost is the time from the run that drew it to the next run, drawn or not: the browser
   * runs the loop again only once the frame is out. Under load most drawn frames are followed by
   * undrawn ones, so counting only drawn-to-drawn gaps would miss them.
   */
  #tick(now: number, drew: boolean): void {
    const gap = now - this.#last;
    let counted = this.#last >= 0 && gap >= SHORTEST_MS && gap < RUN_GAP_MS;
    if (counted && this.#ignore > 0) {
      this.#ignore--;
      counted = false;
    }
    if (counted && this.#lastDrew) this.#smoothed += (gap - this.#smoothed) * WEIGHT;
    else if (counted && !drew) this.#ticks += (gap - this.#ticks) * WEIGHT;
    this.#last = now;
    this.#lastDrew = drew;
  }

  /**
   * The drawing buffer was just resized. The reallocation stalls the next frames; counting that
   * would drive resolution down in a loop. The next few gaps are skipped and measurement restarts.
   */
  resized(): void {
    this.#ignore = RESIZE_SETTLE_FRAMES;
    this.#smoothed = SIXTY_HZ;
  }

  /** Whether idle frames arrive about on time, i.e. there is time for background work. */
  get spare(): boolean {
    return this.#ticks < SIXTY_HZ * 1.5;
  }

  /** The smoothed gap between drawn frames, in milliseconds. */
  get frameMs(): number {
    return this.#smoothed;
  }

  /** 0 while frames are on time, rising to 1 at twice the budget. Smoothed, so it falls slowly. */
  get pressure(): number {
    const over = this.#smoothed / this.#target;
    return Math.min(1, Math.max(0, (over - ON_TIME) / (FULL - ON_TIME)));
  }
}
