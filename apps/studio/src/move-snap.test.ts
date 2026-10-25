import { describe, expect, it } from 'vitest';
import { type Box, describeHit, gridStepFor, snapDelta } from './move-snap.js';

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => ({
  min: [x0, y0, z0],
  max: [x1, y1, z1],
});

describe('gridStepFor', () => {
  it('is finer close up and coarser far away', () => {
    expect(gridStepFor(0.01)).toBeLessThan(gridStepFor(0.5));
    expect(gridStepFor(0.5)).toBeLessThan(gridStepFor(5));
  });
  it('keeps its lines a hand apart on screen', () => {
    for (const wpp of [0.02, 0.2, 2, 20]) expect(gridStepFor(wpp) / wpp).toBeGreaterThanOrEqual(14);
  });
});

describe('snapDelta', () => {
  const moving = box(0, 0, 0, 10, 10, 10);
  const wall = box(30, -5, -5, 40, 15, 15);

  it('stands a box against another one when it comes near, side to side', () => {
    // Asked for 19.6 along X: its high side would be at 29.6, 0.4 from the wall's low side at 30.
    const s = snapDelta({
      moving,
      others: [wall],
      delta: [19.6, 0, 0],
      free: [true, false, false],
      worldPerPixel: 0.1,
    });
    expect(s.delta[0]).toBeCloseTo(20, 9);
    expect(s.hits[0]).toMatchObject({ axis: 0, feature: 'max', target: 'face', at: 30, other: 0 });
  });

  it('leaves it alone out of reach, and on the axes the gesture does not move', () => {
    const s = snapDelta({
      moving,
      others: [wall],
      delta: [12, 3.3, 0],
      free: [true, false, false],
      worldPerPixel: 0.1,
      grid: false,
    });
    expect(s.delta).toEqual([12, 3.3, 0]);
    expect(s.hits).toEqual([]);
  });

  it('lines up middle to middle', () => {
    const tall = box(0, 20, -45, 10, 30, 55);
    const s = snapDelta({
      moving,
      others: [tall],
      delta: [0, 0, 0.3],
      free: [false, false, true],
      worldPerPixel: 0.1,
      grid: false,
    });
    expect(s.delta[2]).toBeCloseTo(0, 9);
    expect(s.hits[0]).toMatchObject({ axis: 2, feature: 'mid', target: 'middle' });
  });

  it('falls on the grid when nothing else is near, and on a body in preference to it', () => {
    const onGrid = snapDelta({
      moving,
      others: [],
      delta: [20.2, 0, 0],
      free: [true, false, false],
      worldPerPixel: 0.5,
    });
    expect(onGrid.hits[0]?.target).toBe('grid');
    expect(onGrid.delta[0] % gridStepFor(0.5)).toBeCloseTo(0, 6);
    const near = box(30.1, 0, 0, 40, 10, 10);
    const s = snapDelta({
      moving,
      others: [near],
      delta: [20, 0, 0],
      free: [true, false, false],
      worldPerPixel: 0.5,
    });
    expect(s.hits[0]?.target).toBe('face');
    expect(s.delta[0]).toBeCloseTo(20.1, 9);
  });

  it('snaps both axes of a plane drag on their own', () => {
    const corner = box(30, 30, 0, 40, 40, 10);
    const s = snapDelta({
      moving,
      others: [corner],
      delta: [19.8, 20.3, 0],
      free: [true, true, false],
      worldPerPixel: 0.1,
      grid: false,
    });
    expect(s.delta[0]).toBeCloseTo(20, 9);
    expect(s.delta[1]).toBeCloseTo(20, 9);
    expect(s.hits).toHaveLength(2);
  });

  it('names what it landed on', () => {
    expect(
      describeHit({ axis: 0, feature: 'max', target: 'face', at: 30, other: 1 }, [
        'Body 1',
        'Body 2',
      ]),
    ).toBe('X to a side of Body 2');
    expect(describeHit({ axis: 2, feature: 'min', target: 'grid', at: 10 }, [])).toBe(
      'Z on the grid',
    );
  });
});
