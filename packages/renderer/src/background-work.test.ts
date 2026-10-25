import { describe, expect, it } from 'vitest';
import { BackgroundWork } from './background-work.js';

function* counting(into: number[], steps: number) {
  for (let i = 0; i < steps; i++) {
    into.push(i);
    yield;
  }
}

describe('background work in slices', () => {
  it('stops at the end of its slice and carries on from there', () => {
    const work = new BackgroundWork();
    const done: number[] = [];
    work.add(counting(done, 10));
    let clock = 0;
    work.run(3, () => clock++);
    expect(done).toEqual([0, 1, 2]);
    clock = 0;
    work.run(100, () => clock++);
    expect(done).toHaveLength(10);
    expect(work.pending).toBe(false);
  });

  it('can be dropped before it is done, and survives a failure', () => {
    const work = new BackgroundWork();
    const done: number[] = [];
    const drop = work.add(counting(done, 10));
    work.add(
      (function* () {
        yield;
        throw new Error('broken');
      })(),
    );
    drop();
    const quiet = console.error;
    console.error = () => {};
    work.run(Number.POSITIVE_INFINITY);
    console.error = quiet;
    expect(done).toEqual([]);
    expect(work.pending).toBe(false);
  });
});
