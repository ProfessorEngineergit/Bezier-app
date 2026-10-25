/**
 * Idle behaviour: breathing, blinking, looking at the pointer or glancing aside, weight shifts and
 * falling asleep. No animation clips: each adds offsets to the channel targets every frame, so a
 * reaction can start mid-blink and the springs blend it.
 */

import type { Values } from './channels.js';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Seconds without input before he dozes off, and how long falling asleep takes. */
export const SLEEP_AFTER = 25;
const SLEEP_RAMP = 6;
/** How long he keeps looking at the pointer after it stops moving. */
const GAZE_HOLD = 4;

export class Idle {
  /** 0 awake, 1 asleep. */
  sleep = 0;
  readonly #random: () => number;
  /** Null until the first frame; the clock does not start at zero and he must not start asleep. */
  #lastInput: number | null = null;
  #blinkNext: number | null = null;
  #blinkStart = 0;
  #blinking = false;
  #blinkTwice = false;
  #gazeUntil = -1;
  #gazeX = 0;
  #gazeY = 0;
  #seenX = 0;
  #seenY = 0;
  #glanceNext = 3;
  #glanceX = 0;
  #glanceY = 0;
  #shiftNext = 6;
  #shiftStart = -9;
  #shiftSide = 1;

  constructor(random: () => number = Math.random) {
    this.#random = random;
  }

  get blinking(): boolean {
    return this.#blinking;
  }

  /** Looking at the pointer. */
  gazing(now: number): boolean {
    return now < this.#gazeUntil;
  }

  /** Wakes him on input. Returns whether he was fully asleep (to play the stretch). */
  touch(now: number): boolean {
    const wasAsleep = this.sleep > 0.4;
    this.#lastInput = now;
    this.sleep = 0;
    return wasAsleep;
  }

  /**
   * Looks towards a direction, in degrees: turn (positive is Nib's left), nod (positive is down).
   */
  look(turn: number, nod: number, now: number): void {
    this.#seenX = clamp(turn, -34, 34);
    // Limit the downward look: under the window's top edge the pointer is nearly always below him,
    // and at 18 degrees he appears to hang his head.
    this.#seenY = clamp(nod, -10, 10);
    this.#gazeUntil = now + GAZE_HOLD;
  }

  /** Stops looking at the current target. */
  lookAway(): void {
    this.#gazeUntil = -1;
  }

  /** Adds this frame's idle motion to `target`. */
  update(now: number, dt: number, target: Values): void {
    const awake = clamp(1 - this.sleep, 0, 1);
    // Breathing: chest rises, shoulders follow; slower when sleepier.
    const breath = Math.sin((now * Math.PI * 2) / (4.4 + 2.6 * this.sleep));
    target.add('bodyPitch', 0.55 * breath);
    target.add('bodyZ', 0.0006 * breath);
    target.add('neckNod', -0.35 * breath);
    for (const arm of ['armL', 'armR'] as const) {
      target.add(`${arm}Bend`, 0.8 * breath);
      target.add(`${arm}Out`, 0.6 * breath);
    }
    this.#blink(now, target);
    this.#look(now, dt, target, awake);
    this.#shift(now, target);
    if (this.sleep > 0) this.#drowse(target);
    this.#lastInput ??= now;
    this.sleep = clamp((now - this.#lastInput - SLEEP_AFTER) / SLEEP_RAMP, 0, 1);
  }

  // A blink closes fast, holds briefly and opens slower; about one in seven is doubled.
  #blink(now: number, target: Values): void {
    if (this.#blinkNext === null) this.#blinkNext = now + 1.5;
    if (now > this.#blinkNext) {
      this.#blinking = true;
      this.#blinkStart = now;
      this.#blinkTwice = this.#random() < 0.15;
      this.#blinkNext = now + 2.4 + this.#random() * 3.6;
    }
    if (!this.#blinking) return;
    const u = now - this.#blinkStart;
    if (u < 0) return;
    // 0.22 s total: 0.06 closing, 0.04 shut, 0.12 opening. Timed by the clock, not the lid value,
    // which is also zero on the first frame.
    if (u >= 0.22) {
      if (this.#blinkTwice) {
        this.#blinkTwice = false;
        this.#blinkStart = now + 0.08;
      } else this.#blinking = false;
      return;
    }
    const closed = u < 0.06 ? u / 0.06 : u < 0.1 ? 1 : 1 - (u - 0.1) / 0.12;
    target.set('lidClose', Math.max(target.get('lidClose'), clamp(closed, 0, 1)));
  }

  // The eyes are fixed lenses, so looking turns the neck and slightly the body.
  #look(now: number, dt: number, target: Values, awake: number): void {
    let turn = this.#seenX;
    let nod = this.#seenY;
    if (!this.gazing(now)) {
      if (now > this.#glanceNext) {
        this.#glanceNext = now + 2.5 + this.#random() * 4;
        this.#glanceX = (this.#random() - 0.5) * 22;
        this.#glanceY = (this.#random() - 0.4) * 10;
      }
      turn = this.#glanceX;
      nod = this.#glanceY;
    }
    const ease = 1 - Math.exp(-dt * 7);
    this.#gazeX += (turn - this.#gazeX) * ease;
    this.#gazeY += (nod - this.#gazeY) * ease;
    target.add('neckTurn', this.#gazeX * awake);
    target.add('neckNod', this.#gazeY * awake);
    target.add('bodyTwist', this.#gazeX * 0.25 * awake);
    target.add('neckTilt', -this.#gazeX * 0.12 * awake);
  }

  // Every few seconds he briefly shifts weight to the other leg.
  #shift(now: number, target: Values): void {
    if (now > this.#shiftNext && this.sleep < 0.5) {
      this.#shiftStart = now;
      this.#shiftNext = now + 6 + this.#random() * 7;
      this.#shiftSide = this.#random() < 0.5 ? 1 : -1;
    }
    const u = (now - this.#shiftStart) / 1.1;
    if (u < 0 || u >= 1) return;
    const bump = Math.sin(u * Math.PI);
    const loaded = this.#shiftSide > 0 ? 'legLExt' : 'legRExt';
    const eased = this.#shiftSide > 0 ? 'legRExt' : 'legLExt';
    target.add('bodyRoll', 1.6 * this.#shiftSide * bump);
    target.add(loaded, 0.0012 * bump);
    target.add(eased, -0.0008 * bump);
  }

  // Asleep: lids sink, head nods forward, glow dims.
  #drowse(target: Values): void {
    const s = this.sleep;
    target.set('lidClose', Math.max(target.get('lidClose'), 0.78 * s));
    target.add('neckNod', 9 * s);
    target.add('bodyPitch', 3 * s);
    target.add('lidTilt', 6 * s);
    target.set('smile', target.get('smile') + (0.55 - target.get('smile')) * s);
    target.set('glow', target.get('glow') * (1 - 0.7 * s));
  }
}
