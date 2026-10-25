import { describe, expect, it } from 'vitest';
import { stopAt } from './LevelSwitch.js';

describe('the level switch', () => {
  it('gives each stop an equal share of the track', () => {
    expect(stopAt(0.1, 4)).toBe(0);
    expect(stopAt(0.26, 4)).toBe(1);
    expect(stopAt(0.74, 4)).toBe(2);
    expect(stopAt(0.99, 4)).toBe(3);
  });

  it('holds at the ends when the pointer leaves the track', () => {
    expect(stopAt(-0.4, 4)).toBe(0);
    expect(stopAt(1.6, 4)).toBe(3);
  });
});
