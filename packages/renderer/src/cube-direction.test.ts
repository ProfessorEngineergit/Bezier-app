import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { cubeDirection } from './helpers.js';

const out = new Vector3();
const from = (x: number, y: number, z: number) =>
  cubeDirection(new Vector3(x, y, z), new Vector3(0, 0, 0), out);

describe('looking along an edge or a corner of the cube', () => {
  it('finds the edge between Top and Front, and a corner', () => {
    expect(from(0, -5, 5)).toBe(true);
    expect(out.toArray().map((v) => Math.round(v * 1000) / 1000)).toEqual([0, -0.707, 0.707]);
    expect(from(3, -3, 3)).toBe(true);
  });

  it('leaves an axis view and a hand-turned view alone', () => {
    expect(from(0, 0, 10)).toBe(false);
    expect(from(1, -5, 4)).toBe(false);
  });
});
