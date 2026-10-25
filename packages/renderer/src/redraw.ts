/**
 * Draws a frame only when the picture is out of date: the camera moved, the viewport API was called
 * (`ViewportImpl`), or something animates; never while the canvas is off screen. Redrawing a large
 * model every frame costs about 20 % CPU and GPU when idle.
 */

/**
 * Frames costlier than this are paced when the camera is still: the next waits as long as the last
 * took, counted from when the thread was free. With software rendering a large model's frame takes
 * seconds and back-to-back frames block input. Camera movement is never paced.
 */
const PACED_FROM_MS = 50;

export class Redraw {
  #dirty = true;
  /** When the thread was free again after the last frame drawn. */
  #freedAt = Number.NEGATIVE_INFINITY;
  #cost = 0;
  #loopedAt = 0;
  #drewLast = false;
  #onScreen = true;
  #animating: () => boolean = () => false;
  readonly #visibility: IntersectionObserver | null;

  constructor(canvas: Element) {
    this.#visibility =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            const last = entries[entries.length - 1];
            if (last === undefined) return;
            this.#onScreen = last.isIntersecting;
            // Whatever changed while hidden was not drawn; show it on the way back.
            if (this.#onScreen) this.#dirty = true;
          })
        : null;
    this.#visibility?.observe(canvas);
  }

  /** The picture is out of date: draw it again on the next frame. */
  invalidate(): void {
    this.#dirty = true;
  }

  /** Something on show moves by itself, and while this says so every frame is drawn. */
  setAnimating(animating: () => boolean): void {
    this.#animating = animating;
  }

  /**
   * Called at the top of every render loop turn. The previous frame's cost is the time since,
   * including the time the thread was held.
   */
  looped(now: number): void {
    if (this.#drewLast) {
      this.#cost = now - this.#loopedAt;
      this.#freedAt = now;
    }
    this.#loopedAt = now;
    this.#drewLast = false;
  }

  /** Whether to draw this frame. Answering yes marks the picture as up to date. */
  due(moved: boolean, effect: boolean, now = 0): boolean {
    if (moved) this.#dirty = true;
    if (!this.#onScreen || (!this.#dirty && !effect && !this.#animating())) return false;
    if (!moved && !effect && this.#cost > PACED_FROM_MS && now - this.#freedAt < this.#cost)
      return false;
    this.#dirty = false;
    this.#drewLast = true;
    return true;
  }

  dispose(): void {
    this.#visibility?.disconnect();
  }
}
