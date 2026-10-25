import { describe, expect, it } from 'vitest';
import { type Piece, Stream } from './tessellation.js';
import type { MeshPiece } from './types.js';

/** A piece of `triangles` triangles over three shared vertices. */
function piece(triangles: number): Piece {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array(9),
    indices: new Uint32Array(triangles * 3),
    runs: new Uint32Array(0),
  };
}

// Batches are a hundred thousand triangles and more, which takes a while in a full
// parallel test run.
describe('streaming parts of a large mesh', { timeout: 30_000 }, () => {
  it('sends them in batches, not one message per part', () => {
    const sent: MeshPiece[] = [];
    const stream = new Stream((batch) => sent.push(batch));
    stream.add(piece(100_000));
    expect(sent).toHaveLength(0);
    stream.add(piece(60_000));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.indices.length).toBe(160_000 * 3);
  });

  it('sends copies, so the parts kept for reuse are never moved away', () => {
    const sent: MeshPiece[] = [];
    const stream = new Stream((batch) => sent.push(batch));
    const kept = piece(200_000);
    stream.add(kept);
    expect(sent[0]?.positions).not.toBe(kept.positions);
    expect(sent[0]?.indices).not.toBe(kept.indices);
  });
});
