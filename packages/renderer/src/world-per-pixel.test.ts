import { describe, expect, it } from 'vitest';
import { worldPerPixel } from './world-per-pixel.js';

describe('worldPerPixel', () => {
  it('scales with distance under a lens, so a drag matches the cursor at any zoom', () => {
    const camera = { fov: 50 };
    const near = worldPerPixel(camera, 100, 600);
    const far = worldPerPixel(camera, 1000, 600);
    // Ten times the distance covers ten times the world per pixel: the proportionality a fixed
    // "millimetres per pixel" constant cannot offer.
    expect(far / near).toBeCloseTo(10, 5);
  });

  it('answers a real perspective projection, not an approximation', () => {
    const distance = 1000;
    const height = 600;
    const expected = (2 * distance * Math.tan((50 * Math.PI) / 360)) / height;
    expect(worldPerPixel({ fov: 50 }, distance, height)).toBeCloseTo(expected, 10);
  });

  it('ignores distance entirely under an orthographic camera', () => {
    const camera = { isOrthographicCamera: true as const, top: 100, bottom: -100, zoom: 2 };
    const near = worldPerPixel(camera, 10, 600);
    const far = worldPerPixel(camera, 10000, 600);
    expect(near).toBe(far);
    expect(near).toBeCloseTo(200 / 600 / 2, 10);
  });

  it('never divides by zero when the viewport has not been measured yet', () => {
    expect(Number.isFinite(worldPerPixel({ fov: 50 }, 100, 0))).toBe(true);
  });
});
