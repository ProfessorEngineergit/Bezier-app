/** Trackpad momentum belongs to the swipe that started it, not to new commands. */
export class PerformanceGesture {
  #last = Number.NEGATIVE_INFINITY;
  #delta = 0;
  #used = 0;
  #turned = 0;

  /**
   * `busy`: the readout is still turning. A push in the other direction is queued; momentum in the
   * current direction is consumed.
   */
  wheel(now: number, delta: number, busy = false): number {
    // Momentum only fades in its own direction, so a reverse push is a new swipe and need not
    // wait for the old momentum to end.
    const reversed = this.#used !== 0 && delta !== 0 && Math.sign(delta) === -this.#used;
    if (now - this.#last > 280 || reversed) {
      this.#delta = 0;
      this.#used = 0;
    }
    this.#last = now;
    if (this.#used !== 0) return 0;
    this.#delta += delta;
    if (Math.abs(this.#delta) < 16) return 0;
    const direction = Math.sign(this.#delta);
    if (busy && direction === -this.#turned) return 0;
    this.#used = direction;
    if (busy) return 0;
    this.#turned = direction;
    return direction;
  }
}
