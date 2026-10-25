import { describe, expect, it } from 'vitest';
import { type ImportOutline, importPreview } from './import-preview.js';

const outline = (): ImportOutline => ({
  edges: {
    positions: new Float32Array([0, 0, -5, 10, 0, -5]),
    polylineStarts: new Uint32Array([0]),
  },
  box: { min: { x: 0, y: 0, z: -5 }, max: { x: 10, y: 4, z: 3 } },
});

describe('a model on its way in', () => {
  it('is drawn where it will land, beside what is there and on the floor', () => {
    const seen: (ImportOutline | null)[] = [];
    const stop = importPreview.subscribe((shown) => seen.push(shown));
    importPreview.place({ x: 40, z: 5 });
    importPreview.show(outline());
    const shown = seen.at(-1);
    expect(shown?.box.min).toEqual({ x: 40, y: 0, z: 0 });
    expect([...(shown?.edges.positions ?? [])]).toEqual([40, 0, 0, 50, 0, 0]);
    const piece = {
      positions: new Float32Array([1, 2, -5]),
      normals: new Float32Array(3),
      indices: new Uint32Array(0),
    };
    const pieces: Float32Array[] = [];
    const off = importPreview.onPiece((each) => pieces.push(each.positions));
    importPreview.piece(piece);
    expect([...(pieces[0] ?? [])]).toEqual([41, 2, 0]);
    importPreview.clear();
    off();
    stop();
  });

  it('forgets the move when the import ends', () => {
    importPreview.place({ x: 40, z: 5 });
    importPreview.arrived();
    const seen: (ImportOutline | null)[] = [];
    const stop = importPreview.subscribe((shown) => seen.push(shown));
    importPreview.show(outline());
    expect(seen.at(-1)?.box.min.x).toBe(0);
    importPreview.clear();
    stop();
  });
});
