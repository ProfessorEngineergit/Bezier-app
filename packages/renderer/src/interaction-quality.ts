/**
 * Lowers the render resolution while the camera moves, as far as the measured frame time requires
 * (`frame-budget.ts`), in eighths of a pixel down to half a pixel per point, and restores it once
 * the camera stops. The learned resolution carries over to the next movement.
 *
 * Heavy models start at the window's pixel budget and drop their outlines while moving; light
 * models go lower only when frames are actually late. Motion is detected by comparing camera
 * matrices frame to frame. Nothing allocates per frame.
 */

import { type Camera, Vector2, type WebGLRenderer } from 'three';
import { FrameBudget } from './frame-budget.js';
import { watchPixelDensity } from './pixel-density.js';

/** How long the camera must be still before full quality comes back. */
const SETTLE_MS = 180;
/**
 * Relative change of a camera matrix element that still counts as still. Exact equality fails after
 * zooming in (damping leaves an ever smaller tail); 1e-9 is far below a hundredth of a pixel.
 */
const STILL = 1e-9;
/** Where a heavy model starts moving, in pixels per CSS pixel, before anything is measured. */
const HEAVY_RATIO = 1;
/** The lowest it ever goes. Below half, edges and text on the model break up. */
const LOWEST_RATIO = 0.5;

/**
 * Sharpness traded for smoothness while moving: 0 keeps full resolution, 1 allows half resolution
 * to hold 60 fps. App-wide (Settings and the Display panel), read by every viewport on its next
 * adjustment.
 *
 * In between, the floor is proportional and the target frame rate rises from 30 to 60 over the
 * first half. The default, 0.5, stays at or above 1.25 pixels per point on a Retina screen.
 */
let preference = 0.5;

export function setMotionPreference(bias: number): void {
  preference = Math.min(1, Math.max(0, bias));
}

/** The lowest resolution the preference allows, for a full resolution of `full`. */
export function floorFor(full: number, bias: number): number {
  return Math.max(LOWEST_RATIO, full - bias * (full - LOWEST_RATIO));
}

/** The frame time aimed for, in milliseconds. */
export function targetFor(bias: number): number {
  return 1000 / (30 + 30 * Math.min(1, bias * 2));
}

/**
 * Pixel budget for a moving view, by preference: 6 M at the default, 4 M at the smooth end, none
 * at the sharp end. Measured with `apps/studio/src/fill-bench.ts` (M1 Max, 2 M triangles): p95
 * frame time is 5.9 ms at 5.0 M pixels, 22 ms at 7.7 M, 33 ms at 11 M, 67 ms at 17 M.
 */
export function movingPixels(bias: number): number {
  return bias <= 0 ? Number.POSITIVE_INFINITY : 4e6 * bias ** -0.585;
}

/** The highest ratio that keeps a `width` × `height` (CSS pixels) view within `pixels`. */
export function ratioForPixels(width: number, height: number, pixels: number): number {
  const area = width * height;
  return area > 0 ? Math.sqrt(pixels / area) : Number.POSITIVE_INFINITY;
}
/** Between two changes of resolution: each one resizes the drawing buffer. */
const STEP_MS = 300;
/** After a step down, how long the previous resolution stays out of reach, to avoid oscillation. */
const CLIMB_BLOCK_MS = 2500;
/** Each failed attempt to return doubles the wait, up to this. */
const CLIMB_BLOCK_MAX_MS = 20000;
/** The resolution moves in eighths, so a small wobble in frame time changes nothing. */
const quantise = (ratio: number) => Math.round(ratio * 8) / 8;

export class InteractionQuality {
  readonly #renderer: WebGLRenderer;
  #fullRatio: number;
  readonly #budget: FrameBudget;
  readonly #last = new Float64Array(16);
  #heavy = false;
  #moving = false;
  #movedAt = Number.NEGATIVE_INFINITY;
  /** The resolution while moving, as last learned. */
  #movingRatio: number;
  /** The resolution the drawing buffer has now. */
  #ratio: number;
  #steppedAt = 0;
  /** The resolution frames last ran late at, and until when not to return to it. */
  #ceiling = Number.POSITIVE_INFINITY;
  #ceilingUntil = 0;
  #block = CLIMB_BLOCK_MS;
  #listener: ((moving: boolean) => void) | null = null;
  readonly #size = new Vector2();
  #unwatch: () => void = () => {};

  constructor(renderer: WebGLRenderer, fullRatio: number, budget: FrameBudget = new FrameBudget()) {
    this.#renderer = renderer;
    this.#fullRatio = fullRatio;
    this.#budget = budget;
    this.#movingRatio = fullRatio;
    this.#ratio = fullRatio;
  }

  /**
   * The highest resolution the pixel budget allows while moving, in eighths, never below the floor.
   * Based on the CSS size, which resolution changes do not alter.
   */
  #pixelCap(): number {
    const size = this.#renderer.getSize(this.#size);
    const cap = ratioForPixels(size.x, size.y, movingPixels(preference));
    return Math.max(LOWEST_RATIO, Math.min(this.#fullRatio, Math.floor(cap * 8) / 8));
  }

  /**
   * Whether the model is heavy: it then starts moving at one pixel per point (or the pixel budget)
   * and without outlines.
   */
  setHeavy(heavy: boolean): void {
    if (heavy && !this.#heavy) {
      const floor = floorFor(this.#fullRatio, preference);
      this.#movingRatio = Math.max(floor, Math.min(this.#movingRatio, HEAVY_RATIO));
    }
    const was = this.#heavy;
    this.#heavy = heavy;
    if (was && !heavy && this.#moving) this.#listener?.(false);
  }

  /** Told when a heavy model starts and stops being drawn without its outlines. */
  onChange(listener: (moving: boolean) => void): void {
    this.#listener = listener;
  }

  /** Whether the camera is moving, as of the last frame. */
  get moving(): boolean {
    return this.#moving;
  }

  /** How long the camera has been still at `now`, in milliseconds; 0 while it moves. */
  stillFor(now: number): number {
    return this.#moving ? 0 : now - this.#movedAt;
  }

  /**
   * Called once per frame after camera updates, before drawing. True when a redraw is needed: the
   * camera moved, or it just settled and full quality is back.
   */
  frame(camera: Camera, now: number): boolean {
    const elements = camera.matrixWorld.elements;
    let changed = false;
    for (let i = 0; i < 16; i++) {
      const value = elements[i] ?? 0;
      const before = this.#last[i] ?? 0;
      if (Math.abs(value - before) > STILL * (1 + Math.abs(value))) {
        changed = true;
        this.#last[i] = value;
      }
    }
    if (changed) this.#movedAt = now;
    if (changed && !this.#moving) {
      this.#moving = true;
      this.#steppedAt = now;
      // A heavy model goes straight to the pixel budget instead of stuttering first.
      if (this.#heavy) this.#movingRatio = Math.min(this.#movingRatio, this.#pixelCap());
      this.#apply(this.#movingRatio);
      if (this.#heavy) this.#listener?.(true);
    } else if (this.#moving && !changed && now - this.#movedAt > SETTLE_MS) {
      this.#settle();
      return true;
    } else if (this.#moving) {
      this.#adapt(now);
    }
    return changed;
  }

  /** Step the resolution towards what the measured frame time allows. */
  #adapt(now: number): void {
    if (now - this.#steppedAt < STEP_MS) return;
    this.#budget.setTarget(targetFor(preference));
    // The pixel budget wins over the floor: a huge window turns smoothly first.
    const cap = this.#heavy ? this.#pixelCap() : this.#fullRatio;
    const floor = Math.min(floorFor(this.#fullRatio, preference), cap);
    const pressure = this.#budget.pressure;
    let next = Math.max(floor, this.#movingRatio);
    if (pressure > 0.1) {
      // Larger steps for later frames and a smoother preference.
      const give = 0.2 + 0.2 * preference;
      next = Math.max(floor, quantise(next * (1 - give * pressure)));
      if (next < this.#movingRatio) {
        // Stepping down again right after a climb: that climb did not hold.
        const failed = now < this.#ceilingUntil + STEP_MS * 4;
        this.#block = failed ? Math.min(this.#block * 2, CLIMB_BLOCK_MAX_MS) : CLIMB_BLOCK_MS;
        this.#ceiling = this.#movingRatio;
        this.#ceilingUntil = now + this.#block;
      }
    } else if (pressure === 0) {
      const limit = now < this.#ceilingUntil ? quantise(this.#ceiling - 0.125) : this.#fullRatio;
      next = Math.max(next, Math.min(limit, cap, quantise(next + 0.125)));
    }
    if (next === this.#movingRatio) return;
    this.#movingRatio = next;
    this.#steppedAt = now;
    this.#apply(next);
  }

  /**
   * The display density changed: the new density is full quality, learned state is reset, and the
   * moving resolution is capped by it. Applied at once so the buffer is resized only once.
   */
  setFullRatio(ratio: number): void {
    if (ratio === this.#fullRatio) return;
    this.#fullRatio = ratio;
    this.#movingRatio = Math.min(this.#movingRatio, ratio);
    this.#ceiling = Number.POSITIVE_INFINITY;
    this.#ceilingUntil = 0;
    this.#block = CLIMB_BLOCK_MS;
    this.#apply(this.#moving ? this.#movingRatio : ratio);
  }

  /**
   * Follows the display density up to `max`, calling `changed` after each change. Only for views
   * without a caller-fixed ratio (captures and tests keep theirs).
   */
  followDisplay(max: number, changed: () => void): void {
    this.#unwatch();
    this.#unwatch = watchPixelDensity((next) => {
      this.setFullRatio(Math.min(next, max));
      changed();
    });
  }

  dispose(): void {
    this.#unwatch();
  }

  #apply(ratio: number): void {
    if (ratio === this.#ratio) return;
    this.#ratio = ratio;
    this.#renderer.setPixelRatio(ratio);
    this.#budget.resized();
  }

  #settle(): void {
    this.#moving = false;
    this.#block = CLIMB_BLOCK_MS;
    this.#apply(this.#fullRatio);
    if (this.#heavy) this.#listener?.(false);
  }
}
