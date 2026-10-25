import { describe, expect, it } from 'vitest';
import { measurement } from './MeasureMode.js';

describe('measurement', () => {
  it('reports total and axis distances between two world points', () => {
    expect(
      measurement([
        { x: 1, y: 2, z: 3 },
        { x: 4, y: 6, z: 15 },
      ]),
    ).toEqual({ distance: 13, dx: 3, dy: 4, dz: 12 });
  });

  it('waits until both points exist', () => {
    expect(measurement([])).toBeNull();
    expect(measurement([{ x: 0, y: 0, z: 0 }])).toBeNull();
  });
});
