import { describe, expect, it } from 'vitest';
import { drawIn, GAP, keepClear, REACH, resizeFrom } from './panel-place.js';

const STAGE = { width: 1000, height: 700 };
/** A rail along the left, a menu at the lower right. */
const RAIL = { left: 8, top: 200, width: 40, height: 300 };
const MENU = { left: 952, top: 650, width: 40, height: 42 };

describe('keepClear', () => {
  it('leaves a panel that stands clear where it is', () => {
    const panel = { left: 300, top: 100, width: 200, height: 150 };
    expect(keepClear(panel, STAGE, [RAIL, MENU])).toEqual(panel);
  });

  it('pushes a panel off a control the shortest way, to exactly one gap away', () => {
    const panel = { left: 30, top: 250, width: 200, height: 150 };
    const at = keepClear(panel, STAGE, [RAIL]);
    expect(at.left).toBe(RAIL.left + RAIL.width + GAP);
    expect(at.top).toBe(250);
  });

  it('keeps a panel a gap inside the stage', () => {
    const at = keepClear({ left: -50, top: 680, width: 200, height: 150 }, STAGE, []);
    expect(at.left).toBe(GAP);
    expect(at.top).toBe(STAGE.height - 150 - GAP);
  });

  it('steps aside from a panel opened where it stands, onto free ground', () => {
    const dock = { left: 700, top: 300, width: 248, height: 392 };
    const at = keepClear({ left: 720, top: 500, width: 200, height: 150 }, STAGE, [dock, MENU]);
    const overlaps =
      at.left < dock.left + dock.width + GAP &&
      at.left + at.width + GAP > dock.left &&
      at.top < dock.top + dock.height + GAP &&
      at.top + at.height + GAP > dock.top;
    expect(overlaps).toBe(false);
  });
});

describe('drawIn', () => {
  it('lines a panel up one gap beside a control it was let go near', () => {
    const panel = {
      left: RAIL.left + RAIL.width + GAP + REACH - 4,
      top: 260,
      width: 200,
      height: 150,
    };
    expect(drawIn(panel, STAGE, [RAIL]).left).toBe(RAIL.left + RAIL.width + GAP);
  });

  it('leaves a panel alone away from everything', () => {
    const panel = { left: 400, top: 300, width: 200, height: 150 };
    expect(drawIn(panel, STAGE, [RAIL, MENU])).toEqual(panel);
  });
});

describe('resizeFrom', () => {
  it('grows from the corner dragged and keeps the opposite corner still', () => {
    const start = { left: 300, top: 300, width: 200, height: 150 };
    const at = resizeFrom(start, 'nw', -40, -30, STAGE, { width: 120, height: 80 });
    expect(at).toEqual({ left: 260, top: 270, width: 240, height: 180 });
  });

  it('stops at the least size without moving the edge that was not dragged', () => {
    const start = { left: 300, top: 300, width: 200, height: 150 };
    const at = resizeFrom(start, 'nw', 500, 500, STAGE, { width: 120, height: 80 });
    expect(at.left + at.width).toBe(500);
    expect(at.top + at.height).toBe(450);
    expect(at.width).toBe(120);
  });
});
