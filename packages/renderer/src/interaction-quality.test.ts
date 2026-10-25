import { PerspectiveCamera, type Vector2, type WebGLRenderer } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { FrameBudget } from './frame-budget.js';
import {
  floorFor,
  InteractionQuality,
  movingPixels,
  ratioForPixels,
  setMotionPreference,
  targetFor,
} from './interaction-quality.js';

/** A laptop-sized view in CSS pixels, well inside any pixel budget. */
const laptop = (target: Vector2) => target.set(1440, 900);

function setup(heavy: boolean) {
  const ratios: number[] = [];
  const renderer = {
    setPixelRatio: (ratio: number) => ratios.push(ratio),
    getSize: laptop,
  } as unknown as WebGLRenderer;
  const quality = new InteractionQuality(renderer, 2);
  const changes: boolean[] = [];
  quality.onChange((moving) => changes.push(moving));
  quality.setHeavy(heavy);
  const camera = new PerspectiveCamera();
  const move = (x: number) => {
    camera.position.x = x;
    camera.updateMatrixWorld();
  };
  return { quality, camera, move, ratios, changes };
}

describe('drawing a heavy model while it turns', () => {
  // The preference is one setting for the whole application.
  afterEach(() => setMotionPreference(0.5));

  it('drops to one pixel per point while the camera moves, and comes back after', () => {
    setMotionPreference(1);
    const { quality, camera, move, ratios, changes } = setup(true);
    quality.frame(camera, 0);
    move(1);
    quality.frame(camera, 16);
    expect(ratios).toEqual([1]);
    expect(changes).toEqual([true]);
    // Still for a while: full quality again.
    quality.frame(camera, 100);
    expect(changes).toEqual([true]);
    quality.frame(camera, 400);
    expect(ratios).toEqual([1, 2]);
    expect(changes).toEqual([true, false]);
  });

  it('does not hold a light model to the pixel budget of a wide window while frames are on time', () => {
    const ratios: number[] = [];
    const renderer = {
      setPixelRatio: (r: number) => ratios.push(r),
      getSize: (target: Vector2) => target.set(3440, 1440),
    } as unknown as WebGLRenderer;
    const budget = new FrameBudget();
    const quality = new InteractionQuality(renderer, 2, budget);
    const camera = new PerspectiveCamera();
    for (let t = 0; t < 400; t += 16.7) budget.skipped(t);
    let t = 1000;
    for (let i = 0; i < 60; i++, t += 16.7) {
      camera.position.x = i;
      camera.updateMatrixWorld();
      quality.frame(camera, t);
      budget.drawn(t);
    }
    quality.frame(camera, t + 400);
    expect(ratios).toEqual([]);
  });

  it('leaves a light model alone', () => {
    const { quality, camera, move, ratios, changes } = setup(false);
    quality.frame(camera, 0);
    move(1);
    quality.frame(camera, 16);
    quality.frame(camera, 400);
    expect(ratios).toEqual([]);
    expect(changes).toEqual([]);
  });

  it('reads a rounding-sized drift as standing still, so full quality returns after zooming in', () => {
    const { quality, camera, move, changes } = setup(true);
    move(50);
    quality.frame(camera, 0);
    move(51);
    quality.frame(camera, 16);
    // The damped dolly's tail: changes far below a hundredth of a pixel.
    for (let t = 32; t < 400; t += 16) {
      move(51 + 1e-12 * t);
      quality.frame(camera, t);
    }
    expect(changes).toEqual([true, false]);
  });

  it('steps the resolution down while frames run late, and keeps what it learned', () => {
    const ratios: number[] = [];
    const renderer = {
      setPixelRatio: (r: number) => ratios.push(r),
      getSize: laptop,
    } as unknown as WebGLRenderer;
    const budget = new FrameBudget();
    const quality = new InteractionQuality(renderer, 2, budget);
    quality.setHeavy(true);
    const camera = new PerspectiveCamera();
    // Idle frames first, so the display is known: 60 Hz.
    for (let t = 0; t < 400; t += 16.7) budget.skipped(t);
    // A heavy model, turning at 20 frames a second.
    let t = 1000;
    for (let i = 0; i < 60; i++, t += 50) {
      camera.position.x = i;
      camera.updateMatrixWorld();
      quality.frame(camera, t);
      budget.drawn(t);
    }
    expect(Math.min(...ratios)).toBeLessThan(2);
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(0.5);
    // Still: full resolution while nothing moves.
    quality.frame(camera, t + 400);
    expect(ratios[ratios.length - 1]).toBe(2);
    // The next movement starts where the last one ended.
    const learned = ratios[ratios.length - 2];
    camera.position.x = -1;
    camera.updateMatrixWorld();
    quality.frame(camera, t + 1000);
    expect(ratios[ratios.length - 1]).toBe(learned);
  });
  it('does not read its own resize stall as load, so it does not sink to the floor', () => {
    const ratios: number[] = [];
    let stall = 0;
    const renderer = {
      setPixelRatio: (r: number) => {
        ratios.push(r);
        stall = 120;
      },
      getSize: laptop,
    } as unknown as WebGLRenderer;
    const budget = new FrameBudget();
    const quality = new InteractionQuality(renderer, 2, budget);
    quality.setHeavy(true);
    const camera = new PerspectiveCamera();
    let t = 1000;
    // Frames cost 24 ms at full resolution and 10 ms below one and a half; every resize also costs
    // one 120 ms frame.
    for (let i = 0; i < 400; i++) {
      camera.position.x = i;
      camera.updateMatrixWorld();
      quality.frame(camera, t);
      budget.drawn(t);
      const ratio = ratios[ratios.length - 1] ?? 2;
      t += (ratio > 1.5 ? 24 : 10) + stall;
      stall = 0;
    }
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(1);
    // A heavy model starts low (1.25) and climbs to where frames hold: a few steps, not a swing.
    expect(ratios.length).toBeLessThan(8);
  });

  it('never lowers the resolution when sharpness is preferred outright', () => {
    setMotionPreference(0);
    const ratios: number[] = [];
    const renderer = {
      setPixelRatio: (r: number) => ratios.push(r),
      getSize: laptop,
    } as unknown as WebGLRenderer;
    const budget = new FrameBudget();
    const quality = new InteractionQuality(renderer, 2, budget);
    quality.setHeavy(true);
    const camera = new PerspectiveCamera();
    let t = 1000;
    for (let i = 0; i < 120; i++, t += 60) {
      camera.position.x = i;
      camera.updateMatrixWorld();
      quality.frame(camera, t);
      budget.drawn(t);
    }
    expect(ratios.every((ratio) => ratio === 2)).toBe(true);
  });
});

describe('the sharpness-or-smoothness preference', () => {
  it('puts the floor between full and half resolution', () => {
    expect(floorFor(2, 0)).toBe(2);
    expect(floorFor(2, 0.5)).toBe(1.25);
    expect(floorFor(2, 1)).toBe(0.5);
    expect(floorFor(1, 1)).toBe(0.5);
  });

  it('aims for 30 frames a second at one end and 60 from the middle on', () => {
    expect(targetFor(0)).toBeCloseTo(1000 / 30);
    expect(targetFor(0.5)).toBeCloseTo(1000 / 60);
    expect(targetFor(1)).toBeCloseTo(1000 / 60);
  });

  it('holds a wide Retina window to about six million pixels while moving, by default', () => {
    // 3440 × 1440 points: 19.8 M pixels at 2×.
    const cap = ratioForPixels(3440, 1440, movingPixels(0.5));
    expect(3440 * 1440 * cap * cap).toBeCloseTo(6e6, -5);
    expect(cap).toBeGreaterThan(1.1);
    expect(cap).toBeLessThan(1.25);
  });

  it('leaves a laptop window at full resolution, and the sharp end uncapped', () => {
    expect(ratioForPixels(1440, 900, movingPixels(0.5))).toBeGreaterThan(2);
    expect(movingPixels(0)).toBe(Number.POSITIVE_INFINITY);
  });

  it('starts moving at the capped resolution in a wide window, before any frame is late', () => {
    const ratios: number[] = [];
    const renderer = {
      setPixelRatio: (r: number) => ratios.push(r),
      getSize: (target: Vector2) => target.set(3440, 1440),
    } as unknown as WebGLRenderer;
    const quality = new InteractionQuality(renderer, 2);
    quality.setHeavy(true);
    const camera = new PerspectiveCamera();
    quality.frame(camera, 0);
    camera.position.x = 1;
    camera.updateMatrixWorld();
    quality.frame(camera, 16);
    // √(6 M ÷ 4.95 M) = 1.10, rounded down to the eighth below.
    expect(ratios).toEqual([1]);
  });
});

describe('a display whose scale changes', () => {
  it('takes the new density at once while still, and forgets what it learned at the old one', () => {
    const { quality, ratios } = setup(false);
    quality.setFullRatio(1);
    expect(ratios.at(-1)).toBe(1);
    quality.setFullRatio(2);
    expect(ratios.at(-1)).toBe(2);
    const count = ratios.length;
    quality.setFullRatio(2);
    expect(ratios.length, 'the same density does not resize the buffer again').toBe(count);
  });

  it('holds the resolution while moving under the new full one', () => {
    const { quality, camera, move, ratios } = setup(false);
    move(1);
    quality.frame(camera, 0);
    quality.setFullRatio(1);
    expect(ratios.at(-1)).toBe(1);
    move(2);
    quality.frame(camera, 1000);
    // Settled: full quality is the new density, not the one the window opened with.
    quality.frame(camera, 5000);
    expect(ratios.at(-1)).toBe(1);
  });
});
