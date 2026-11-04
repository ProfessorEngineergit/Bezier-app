import { describe, expect, it } from 'vitest';
import { indexFaceTriangles } from './hover-fill.js';

describe('indexFaceTriangles', () => {
  it('groups triangles by face, whatever order they come in', () => {
    const { triangles, offsets } = indexFaceTriangles(Uint32Array.of(2, 0, 2, 1, 0));
    expect([...offsets]).toEqual([0, 2, 3, 5]);
    expect([...triangles.slice(0, 2)]).toEqual([1, 4]);
    expect([...triangles.slice(2, 3)]).toEqual([3]);
    expect([...triangles.slice(3, 5)]).toEqual([0, 2]);
  });

  it('leaves a face without triangles empty', () => {
    const { offsets } = indexFaceTriangles(Uint32Array.of(2));
    expect([...offsets]).toEqual([0, 0, 0, 1]);
  });
});
