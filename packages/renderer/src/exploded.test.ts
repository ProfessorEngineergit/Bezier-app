import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { directions } from './exploded.js';

describe('which way bodies go', () => {
  it('out from the middle of them all', () => {
    const [a, b] = directions([new Vector3(-10, 0, 0), new Vector3(10, 0, 0)]);
    expect(a?.x).toBe(-10);
    expect(b?.x).toBe(10);
  });

  it('apart along one axis when they share a middle, like a nut on a screw', () => {
    const [a, b, c] = directions([new Vector3(), new Vector3(), new Vector3()]);
    expect(a?.z).toBeLessThan(0);
    expect(b?.z).toBe(0);
    expect(c?.z).toBeGreaterThan(0);
  });
});
