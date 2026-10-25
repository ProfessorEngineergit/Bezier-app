import { describe, expect, it } from 'vitest';
import { besideShift, GAP, occupiedBy } from './occupied-space.js';
import type { SessionView } from './session.js';

const box = (x0: number, x1: number, y0 = 0, y1 = 10, z0 = 0, z1 = 10) => ({
  min: { x: x0, y: y0, z: z0 },
  max: { x: x1, y: y1, z: z1 },
});

describe('standing beside what is there', () => {
  it('leaves a thing where it is when nothing is there, or when it is clear of it', () => {
    expect(besideShift(null, box(0, 40))).toBe(0);
    expect(besideShift(box(0, 40), box(100, 140))).toBe(0);
    expect(besideShift(box(0, 40), box(0, 40, 200, 240))).toBe(0);
    expect(besideShift(box(0, 40), box(0, 40, 0, 10, 300, 320))).toBe(0);
  });

  it('moves a thing that would stand in the same place to the far side, with a gap', () => {
    expect(besideShift(box(0, 40), box(0, 40))).toBe(40 + GAP);
    // Its near side ends up GAP past the far side of what is there, wherever it started.
    expect(besideShift(box(0, 40), box(-20, 5))).toBe(40 + GAP + 20);
    expect(besideShift(box(-50, 50), box(-50, 50))).toBe(100 + GAP);
    // Closer than the gap counts as touching.
    expect(besideShift(box(0, 40), box(45, 60))).toBe(40 + GAP - 45);
  });
});

describe('what is in the way', () => {
  const view = (features: unknown[], positions: number[] | null) =>
    ({
      document: { features },
      display: positions === null ? null : { mesh: { positions: new Float32Array(positions) } },
    }) as unknown as SessionView;

  it('counts parts for a part, and pictures for a picture, and not one for the other', () => {
    const picture = {
      id: 'i',
      type: 'reference-image',
      name: 'photo',
      params: { plane: 'XY', x: 0, y: 0, width: 100, height: 50 },
    };
    const both = view([picture], [0, 0, 0, 40, 20, 15]);
    expect(occupiedBy('solid', both)).toEqual({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 40, y: 20, z: 15 },
    });
    expect(occupiedBy('picture', both)).toEqual({
      min: { x: -50, y: -25, z: 0 },
      max: { x: 50, y: 25, z: 0 },
    });
    expect(occupiedBy('solid', view([picture], null))).toBeNull();
    expect(occupiedBy('picture', view([], [0, 0, 0, 1, 1, 1]))).toBeNull();
    expect(occupiedBy('picture', null)).toBeNull();
  });
});
