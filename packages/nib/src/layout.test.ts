import { describe, expect, it } from 'vitest';
import { bubbleBox, dockBox, grown, heightFor } from './layout.js';

const screen = { width: 1280, height: 800 };

describe('layout', () => {
  it('keeps the proportions of the model', () => {
    expect(heightFor(120)).toBeCloseTo(200, 6);
  });

  it('waits low on the left, wholly on screen', () => {
    const box = dockBox(screen, 116);
    expect(box.left).toBe(64);
    expect(box.top + box.height).toBeLessThanOrEqual(screen.height);
    expect(dockBox({ width: 400, height: 150 }, 116).top).toBeGreaterThanOrEqual(8);
  });

  it('opens the bubble toward the side with more room', () => {
    const onLeft = bubbleBox({ left: 64, top: 600, width: 116, height: 193 }, screen, {
      width: 260,
      height: 90,
    });
    expect(onLeft.side).toBe('left');
    expect(onLeft.left).toBeGreaterThan(64 + 116);
    const onRight = bubbleBox({ left: 1100, top: 300, width: 132, height: 220 }, screen, {
      width: 260,
      height: 90,
    });
    expect(onRight.side).toBe('right');
    expect(onRight.left + 260).toBeLessThanOrEqual(1100);
  });

  it('keeps the bubble on screen, however high or low he stands', () => {
    for (const top of [-300, 0, 400, 900]) {
      const b = bubbleBox({ left: 300, top, width: 132, height: 220 }, screen, {
        width: 260,
        height: 90,
      });
      expect(b.top).toBeGreaterThanOrEqual(8);
      expect(b.top + 90).toBeLessThanOrEqual(screen.height - 8);
      expect(b.left).toBeGreaterThanOrEqual(8);
      expect(b.left + 260).toBeLessThanOrEqual(screen.width - 8);
    }
  });

  it('grows a box on every side', () => {
    expect(grown({ left: 10, top: 20, width: 30, height: 40 }, 6)).toEqual({
      left: 4,
      top: 14,
      width: 42,
      height: 52,
    });
  });
});
