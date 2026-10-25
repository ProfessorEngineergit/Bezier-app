import type { FeatureRecord, StableRef } from '@bezier/core';
import type { Mesh } from '@bezier/kernel';
import { describe, expect, it } from 'vitest';
import { colourCopies } from './copy-colours.js';

const NONE = 0xffffffff;

/** A box of three different sides, as six faces of two triangles each, moved and turned a quarter. */
function box(at: [number, number, number], turned: boolean, firstFace: number) {
  const [w, d, h] = [30, 20, 12];
  const corner = (x: number, y: number, z: number): [number, number, number] => {
    const [px, py] = turned ? [-y * d, x * w] : [x * w, y * d];
    return [px + at[0], py + at[1], z * h + at[2]];
  };
  // Each face as four corners: bottom, top, front, back, left, right.
  const quads: [number, number, number][][] = [
    [corner(0, 0, 0), corner(1, 0, 0), corner(1, 1, 0), corner(0, 1, 0)],
    [corner(0, 0, 1), corner(1, 0, 1), corner(1, 1, 1), corner(0, 1, 1)],
    [corner(0, 0, 0), corner(1, 0, 0), corner(1, 0, 1), corner(0, 0, 1)],
    [corner(0, 1, 0), corner(1, 1, 0), corner(1, 1, 1), corner(0, 1, 1)],
    [corner(0, 0, 0), corner(0, 1, 0), corner(0, 1, 1), corner(0, 0, 1)],
    [corner(1, 0, 0), corner(1, 1, 0), corner(1, 1, 1), corner(1, 0, 1)],
  ];
  return { quads, firstFace };
}

function scene(boxes: ReturnType<typeof box>[]): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const triangleFaces: number[] = [];
  for (const { quads, firstFace } of boxes) {
    quads.forEach((quad, face) => {
      const base = positions.length / 3;
      for (const point of quad) positions.push(...point);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      triangleFaces.push(firstFace + face, firstFace + face);
    });
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(positions.length),
    indices: new Uint32Array(indices),
    triangleFaces: new Uint32Array(triangleFaces),
  } as Mesh;
}

const face = (feature: string, tag: string): StableRef =>
  ({ kind: 'face', feature, tag }) as StableRef;
const feature = (id: string, type: string): FeatureRecord =>
  ({ id, type, name: id, params: {} }) as FeatureRecord;

describe('the colours of a copy', () => {
  // Bottom and top red, front and back green, left and right blue.
  const original = [0xff0000, 0xff0000, 0x00ff00, 0x00ff00, 0x0000ff, 0x0000ff];
  const imported = Array.from({ length: 6 }, (_, index) => face('import-1', `face-${index}`));

  it('follow the original, wherever the copy was put and however it was turned', () => {
    // The copy's faces are named in an order of their own, as new faces are.
    const order = [3, 5, 0, 4, 1, 2];
    const copied = order.map((_, index) => face('copy-1', `copy-${index}`));
    const copy = box([140, -60, 25], true, 6);
    const mesh = scene([
      box([0, 0, 0], false, 0),
      { quads: order.map((q) => copy.quads[q] ?? []), firstFace: 6 },
    ]);
    const colours = new Uint32Array(12).fill(NONE);
    colours.set(original);

    const added = colourCopies(
      colours,
      [feature('import-1', 'import-step'), feature('copy-1', 'transform-copy')],
      [...imported, ...copied],
      [imported, copied],
      mesh,
    );

    expect(added).toBe(true);
    expect([...colours.slice(6)]).toEqual(order.map((q) => original[q]));
  });

  it('keep apart two faces alike in shape and different in colour, on a copy that was only shifted', () => {
    // Left blue and right yellow: the same size, the same distance from the middle.
    const sided = [0xff0000, 0xff0000, 0x00ff00, 0x00ff00, 0x0000ff, 0xffff00];
    const order = [5, 4, 3, 2, 1, 0];
    const copied = order.map((_, index) => face('copy-1', `copy-${index}`));
    const copy = box([75, 0, 0], false, 6);
    const mesh = scene([
      box([0, 0, 0], false, 0),
      { quads: order.map((q) => copy.quads[q] ?? []), firstFace: 6 },
    ]);
    const colours = new Uint32Array(12).fill(NONE);
    colours.set(sided);
    colourCopies(
      colours,
      [feature('import-1', 'import-step'), feature('copy-1', 'transform-copy')],
      [...imported, ...copied],
      [imported, copied],
      mesh,
    );
    expect([...colours.slice(6)]).toEqual(order.map((q) => sided[q]));
  });

  it('reach a copy of a copy', () => {
    const first = Array.from({ length: 6 }, (_, index) => face('copy-1', `copy-${index}`));
    const second = Array.from({ length: 6 }, (_, index) => face('copy-2', `copy-${index}`));
    const mesh = scene([
      box([0, 0, 0], false, 0),
      box([50, 0, 0], false, 12),
      box([100, 0, 0], false, 6),
    ]);
    const colours = new Uint32Array(18).fill(NONE);
    colours.set(original);
    colourCopies(
      colours,
      ['import-1', 'copy-1', 'copy-2'].map((id) =>
        feature(id, id.startsWith('copy') ? 'transform-copy' : 'import-step'),
      ),
      [...imported, ...first, ...second],
      [imported, second, first],
      mesh,
    );
    expect([...colours.slice(6, 12)]).toEqual(original);
    expect([...colours.slice(12)]).toEqual(original);
  });

  it('leave a part alone that is not a copy of anything coloured', () => {
    const other = Array.from({ length: 6 }, (_, index) => face('extrude-1', `side-${index}`));
    const mesh = scene([box([0, 0, 0], false, 0), box([50, 0, 0], false, 6)]);
    const colours = new Uint32Array(12).fill(NONE);
    colours.set(original);
    const added = colourCopies(
      colours,
      [feature('import-1', 'import-step'), feature('extrude-1', 'extrude')],
      [...imported, ...other],
      [imported, other],
      mesh,
    );
    expect(added).toBe(false);
    expect([...colours.slice(6)]).toEqual(Array(6).fill(NONE));
  });
});
