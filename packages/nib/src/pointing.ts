/**
 * Pointing at page elements. His arms are too short to point precisely, so he turns his head and
 * raises the arm on that side; the page draws a ring around the target.
 */

import type { Values } from './channels.js';

export interface Aim {
  /** His left arm is on the viewer's right. */
  side: 'L' | 'R';
  /** The arm's outward angle: 0 hangs down, 180 is straight up. */
  arm: number;
  /** Degrees of neck turn (positive toward his left) and nod (positive down). */
  turn: number;
  nod: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Converts a target at (dx, dy) pixels from his shoulder into an aim. `dy` is positive up. */
export function aimAt(dx: number, dy: number): Aim {
  const arm = clamp((Math.atan2(Math.abs(dx), -dy) * 180) / Math.PI, 20, 170);
  return {
    side: dx >= 0 ? 'L' : 'R',
    arm,
    turn: clamp(dx / 6, -30, 30),
    nod: clamp(-dy / 14, -10, 16),
  };
}

/** Animation layer that holds an arm out while a step points. */
export class Pointing {
  #aim: Aim | null = null;
  #until = -Infinity;

  /** Target offset from his shoulder centre, until `until` (clock seconds). */
  at(dx: number, dy: number, until: number): void {
    this.#aim = aimAt(dx, dy);
    this.#until = until;
  }

  stop(): void {
    this.#until = -Infinity;
  }

  active(now: number): boolean {
    return this.#aim !== null && now < this.#until;
  }

  /**
   * Writes the raised arm and a smile into `target`; returns the aim, or null when not pointing.
   */
  apply(now: number, target: Values): Aim | null {
    const aim = this.#aim;
    if (aim === null || now >= this.#until) return null;
    target.set(`arm${aim.side}Out`, aim.arm);
    target.set(`arm${aim.side}Fwd`, 25);
    target.set(`arm${aim.side}Bend`, 10);
    target.set('smile', 1);
    target.set('lidTilt', 4);
    return aim;
  }
}
