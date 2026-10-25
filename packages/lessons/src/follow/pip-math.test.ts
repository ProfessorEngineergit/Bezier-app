import { describe, expect, it } from 'vitest';
import {
  clampTo,
  fromFractions,
  heightFor,
  KEEPOUT,
  MAGNET_PIXELS,
  magnetise,
  resizeOrigin,
  roomFor,
  toFractions,
  widthLimits,
  widthUnder,
} from './pip-math.js';

const window = { width: 1440, height: 900 };
const small = { width: 340, height: 300 };
const large = { width: 880, height: 520 };

it('keeps the opposite corner fixed for every resize direction', () => {
  const at = { x: 600, y: 400 };
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
    const next = resizeOrigin(at, small, large, corner);
    expect(next.x + (corner.endsWith('left') ? large.width : 0)).toBe(
      at.x + (corner.endsWith('left') ? small.width : 0),
    );
    expect(next.y + (corner.startsWith('top') ? large.height : 0)).toBe(
      at.y + (corner.startsWith('top') ? small.height : 0),
    );
  }
});

describe('where the follow panel may sit', () => {
  it('leaves the editor’s own furniture alone', () => {
    const room = roomFor(window, small);
    expect(room.minX).toBe(KEEPOUT.left);
    expect(room.minY).toBe(KEEPOUT.top);
    expect(room.maxX).toBe(window.width - KEEPOUT.right - small.width);
    expect(room.maxY).toBe(window.height - KEEPOUT.bottom - small.height);
  });

  it('keeps a panel wider than the room at the start of it', () => {
    const room = roomFor({ width: 400, height: 300 }, large);
    expect(room.maxX).toBe(room.minX);
    expect(room.maxY).toBe(room.minY);
  });

  it('clamps a place into the room', () => {
    const room = roomFor(window, small);
    expect(clampTo(room, { x: -50, y: 5000 })).toEqual({ x: room.minX, y: room.maxY });
  });
});

describe('a place kept as fractions', () => {
  it('keeps a panel in the corner when it grows, and in the middle when it does', () => {
    const cornerBefore = roomFor(window, small);
    const cornerFraction = toFractions(cornerBefore, {
      x: cornerBefore.maxX,
      y: cornerBefore.maxY,
    });
    expect(cornerFraction).toEqual({ x: 1, y: 1 });
    const after = roomFor(window, large);
    expect(fromFractions(after, cornerFraction)).toEqual({ x: after.maxX, y: after.maxY });
  });

  it('round-trips a place inside the room', () => {
    const room = roomFor(window, small);
    const at = { x: 500, y: 300 };
    const back = fromFractions(room, toFractions(room, at));
    expect(back.x).toBeCloseTo(at.x, 6);
    expect(back.y).toBeCloseTo(at.y, 6);
  });
});

describe('the magnet', () => {
  const room = roomFor(window, small);

  it('pulls onto an edge within its reach, and not beyond it', () => {
    const near = magnetise(room, small, window, { x: room.maxX - MAGNET_PIXELS + 1, y: 400 });
    expect(near.at.x).toBe(room.maxX);
    expect(near.stuck.right).toBe(true);
    const far = magnetise(room, small, window, { x: room.maxX - MAGNET_PIXELS - 20, y: 400 });
    expect(far.at.x).toBe(room.maxX - MAGNET_PIXELS - 20);
    expect(far.stuck.right).toBe(false);
  });

  it('sticks to both axes at a corner', () => {
    const corner = magnetise(room, small, window, { x: room.minX + 5, y: room.maxY - 10 });
    expect(corner.at).toEqual({ x: room.minX, y: room.maxY });
    expect(corner.stuck).toMatchObject({ left: true, bottom: true });
  });

  it('pulls onto the middle line of the window sideways', () => {
    const middle = (window.width - small.width) / 2;
    const snapped = magnetise(room, small, window, { x: middle + 12, y: 400 });
    expect(snapped.at.x).toBe(middle);
    expect(snapped.stuck.centre).toBe(true);
    expect(snapped.stuck.left || snapped.stuck.right).toBe(false);
  });

  it('never leaves the room, whatever is asked', () => {
    const wild = magnetise(room, small, window, { x: -900, y: 9000 });
    expect(wild.at).toEqual({ x: room.minX, y: room.maxY });
  });
});

describe('how large the follow panel may be', () => {
  // A 16:10 picture, 18 px of horizontal inset and 130 px of header and transport.
  const shape = { ratio: 0.625, inset: 18, extra: 130 };

  it('grows the picture and nothing else', () => {
    expect(heightFor(shape, 418) - heightFor(shape, 338)).toBeCloseTo(80 * 0.625);
    expect(widthUnder(shape, heightFor(shape, 400))).toBeCloseTo(400);
  });

  it('keeps the small panel small', () => {
    const { least, most } = widthLimits('small', window, KEEPOUT, shape);
    expect(least).toBe(280);
    expect(most).toBe(460);
  });

  it('never lets the large panel outgrow a short window', () => {
    const short = { width: 1440, height: 420 };
    const { most } = widthLimits('large', short, KEEPOUT, shape);
    expect(heightFor(shape, most)).toBeLessThanOrEqual(
      short.height - KEEPOUT.top - KEEPOUT.bottom + 0.001,
    );
  });
});

it('rests under the view cube when carried near it', () => {
  const room = roomFor(window, small, KEEPOUT);
  const under = 170;
  expect(
    magnetise(room, small, window, { x: 700, y: under + 9 }, MAGNET_PIXELS, [under]).at.y,
  ).toBe(under);
  expect(
    magnetise(room, small, window, { x: 700, y: under + 40 }, MAGNET_PIXELS, [under]).at.y,
  ).toBe(under + 40);
});
