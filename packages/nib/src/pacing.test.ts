import { describe, expect, it } from 'vitest';
import { type Activity, drawInterval } from './pacing.js';

const calm: Activity = {
  reacting: false,
  fresh: false,
  blinking: false,
  gazing: false,
  asleep: false,
};

describe('how often he is drawn', () => {
  it('draws every frame while he reacts or follows a pointer that just moved', () => {
    expect(drawInterval({ ...calm, reacting: true })).toBe(0);
    expect(drawInterval({ ...calm, fresh: true })).toBe(0);
  });

  it('draws half the frames for a blink or a look', () => {
    expect(drawInterval({ ...calm, blinking: true })).toBeCloseTo(1 / 30);
    expect(drawInterval({ ...calm, gazing: true })).toBeCloseTo(1 / 30);
  });

  it('draws fifteen a second to breathe and eight asleep', () => {
    expect(drawInterval(calm)).toBeCloseTo(1 / 15);
    expect(drawInterval({ ...calm, asleep: true })).toBeCloseTo(1 / 8);
  });
});
