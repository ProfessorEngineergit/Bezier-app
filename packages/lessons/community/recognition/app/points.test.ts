import { describe, expect, it } from 'vitest';
import { levelFor, pointsFor } from './points.js';

describe('points', () => {
  it('caps a day of anything', () => {
    expect(pointsFor('lesson-finished', 3)).toBe(30);
    expect(pointsFor('lesson-finished', 1000)).toBe(100);
    expect(pointsFor('star-received', -4)).toBe(0);
  });

  it('turns points into a level and the way to the next', () => {
    expect(levelFor(0)).toEqual({ name: 'Sketch', progress: 0, next: 'Extrude' });
    expect(levelFor(200)).toEqual({ name: 'Extrude', progress: 0.5, next: 'Fillet' });
    expect(levelFor(1_000_000)).toEqual({ name: 'Kernel', progress: 1, next: null });
  });
});
