import { describe, expect, it } from 'vitest';
import {
  dragged,
  fraction,
  magnet,
  quantise,
  scrollTravel,
  stepped,
  typed,
} from './slider-math.js';

const range = { min: 0, max: 100, step: 1 };

describe('a slider', () => {
  it('rounds to its step without floating-point tails', () => {
    expect(quantise(0.35000000000000003, { min: 0.05, max: 0.95, step: 0.05 })).toBe(0.35);
    expect(quantise(140, range)).toBe(100);
  });

  it('knows where a value sits along the track', () => {
    expect(fraction(25, range)).toBe(0.25);
    expect(fraction(5, { min: 5, max: 5, step: 1 })).toBe(0);
  });

  it('pulls a value onto a stop that is near enough, and leaves it alone otherwise', () => {
    expect(magnet(48.5, [25, 50, 75], range)).toBe(50);
    expect(magnet(44, [25, 50, 75], range)).toBe(44);
  });

  it('follows the track sideways and rises when dragged upwards', () => {
    expect(dragged(50, 100, 0, 400, range, [], false)).toBe(75);
    expect(dragged(50, 0, -110, 400, range, [], false)).toBe(100);
    expect(dragged(50, 0, 44, 400, range, [], false)).toBe(30);
  });

  it('snaps to stops on an ordinary drag, but not on a fine one', () => {
    expect(dragged(40, 38, 0, 400, range, [50], false)).toBe(50);
    expect(dragged(40, 38, 0, 400, range, [50], true)).toBe(41);
  });

  it('reads a typed value leniently', () => {
    expect(typed(' 42,5 % ', { min: 0, max: 100, step: 0.5 })).toBe(42.5);
    expect(typed('75°', range)).toBe(75);
    expect(typed('wide', range)).toBeNull();
  });

  it('steps by one, or by ten with Shift', () => {
    expect(stepped(50, 1, false, range)).toBe(51);
    expect(stepped(50, -1, true, range)).toBe(40);
  });
});

describe('scrolling over a slider', () => {
  it('follows the fingers with natural scrolling: right and up raise the value', () => {
    // Fingers to the right on a Mac trackpad: the content would go right, so deltaX is negative.
    expect(scrollTravel(-30, 2, true)).toBeGreaterThan(0);
    expect(scrollTravel(30, 2, true)).toBeLessThan(0);
    // Fingers up: deltaY is positive.
    expect(scrollTravel(1, 40, true)).toBeGreaterThan(0);
    expect(scrollTravel(1, -40, true)).toBeLessThan(0);
  });

  it('follows a plain wheel: turned away from the hand raises the value', () => {
    expect(scrollTravel(0, -120, false)).toBeGreaterThan(0);
    expect(scrollTravel(0, 120, false)).toBeLessThan(0);
    expect(scrollTravel(50, 0, false)).toBeGreaterThan(0);
  });
});
