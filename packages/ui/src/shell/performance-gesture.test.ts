import { expect, it } from 'vitest';
import { PerformanceGesture } from './performance-gesture.js';

it('consumes the complete momentum tail, even when it outlasts the animation', () => {
  const gesture = new PerformanceGesture();
  expect(gesture.wheel(0, 8)).toBe(0);
  expect(gesture.wheel(16, 20)).toBe(1);
  for (let time = 32; time < 1800; time += 16) {
    expect(gesture.wheel(time, 80)).toBe(0);
  }
  expect(gesture.wheel(2200, -30)).toBe(-1);
});

it('turns back at once when the hand reverses, without leaving the field', () => {
  const gesture = new PerformanceGesture();
  expect(gesture.wheel(0, 30)).toBe(1);
  expect(gesture.wheel(16, 60)).toBe(0);
  expect(gesture.wheel(32, -20)).toBe(-1);
  // The tail of the new swipe is spent too.
  expect(gesture.wheel(48, -80)).toBe(0);
});

it('keeps a turn back that arrived while the readout was still turning', () => {
  const gesture = new PerformanceGesture();
  expect(gesture.wheel(0, 30)).toBe(1);
  // Still turning: the push back is not spent, however many events it takes to be free.
  expect(gesture.wheel(16, -30, true)).toBe(0);
  expect(gesture.wheel(32, -20, true)).toBe(0);
  expect(gesture.wheel(48, -20)).toBe(-1);
});

it('spends momentum in the same direction that arrived while the readout was turning', () => {
  const gesture = new PerformanceGesture();
  expect(gesture.wheel(0, 30)).toBe(1);
  expect(gesture.wheel(16, 40, true)).toBe(0);
  expect(gesture.wheel(300 - 10, 40)).toBe(0);
});
