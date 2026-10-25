import { describe, expect, it } from 'vitest';
import { cardCrop } from './card-shot.js';

describe("a project's picture", () => {
  it('keeps the middle of a wide window at the card shape', () => {
    const crop = cardCrop(1600, 900);
    expect(crop.width / crop.height).toBeCloseTo(4 / 3);
    expect(crop.height).toBe(900);
    expect(crop.x).toBe(200);
    expect(crop.y).toBe(0);
  });

  it('keeps the middle of a tall window at the card shape', () => {
    const crop = cardCrop(800, 1245);
    expect(crop.width).toBe(800);
    expect(crop.height).toBe(600);
    expect(crop.y).toBeCloseTo(322.5);
  });

  it('is stored no wider than it is ever shown', () => {
    const crop = cardCrop(2800, 1800);
    expect(crop.outWidth).toBe(800);
    expect(crop.outHeight).toBe(600);
  });
});
