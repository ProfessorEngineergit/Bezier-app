import { describe, expect, it } from 'vitest';
import { recordingClock } from './clock.js';

describe('the recording clock', () => {
  it('leaves paused stretches out', () => {
    let now = 1000;
    const clock = recordingClock(() => now);
    now = 3500;
    expect(clock.elapsed()).toBe(2.5);
    clock.pause();
    expect(clock.paused()).toBe(true);
    now = 9000;
    expect(clock.elapsed()).toBe(2.5);
    clock.resume();
    clock.resume();
    now = 10_000;
    expect(clock.elapsed()).toBe(3.5);
    expect(clock.paused()).toBe(false);
  });

  it('pausing twice pauses once', () => {
    let now = 0;
    const clock = recordingClock(() => now);
    now = 1000;
    clock.pause();
    clock.pause();
    now = 5000;
    expect(clock.elapsed()).toBe(1);
  });
});
