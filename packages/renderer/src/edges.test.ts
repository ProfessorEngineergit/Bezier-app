import { describe, expect, it } from 'vitest';
import { edgeSolidVertices, edgeStartsOf } from './edges.js';

/** Two lines of three points each: four segments, so eight vertices in the line geometry. */
const twoLines = () => ({
  positions: new Float32Array(18),
  polylineStarts: Uint32Array.from([0, 9]),
});

describe('edgeStartsOf', () => {
  it('groups the lines of a body of one solid without a table from the kernel', () => {
    expect(edgeSolidVertices(twoLines())).toBeNull();
    expect([...(edgeStartsOf(twoLines(), 1) ?? [])]).toEqual([0, 8]);
  });

  it('does not guess for several solids: the kernel has to say whose lines are whose', () => {
    expect(edgeStartsOf(twoLines(), 3)).toBeNull();
  });

  it('uses the table the kernel gave', () => {
    const given = { ...twoLines(), solidLines: Uint32Array.from([0, 1, 2]) };
    expect([...(edgeStartsOf(given, 2) ?? [])]).toEqual([0, 4, 8]);
  });
});
