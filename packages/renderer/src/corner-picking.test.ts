/**
 * Corners from seams without per-end text keys must match the text-keyed result exactly: the same
 * faces meeting at the same point, since a vertex reference names a corner by its faces.
 */

import { describe, expect, it } from 'vitest';
import { CornerPicker } from './corner-picking.js';
import { buildCorners } from './corner-table.js';
import { facesOf, type SeamTable, WELD } from './seams.js';

/** The corners as the text-keyed version found them, by their sorted faces. */
function cornersByText(table: SeamTable): Map<string, [number, number, number]> {
  const meeting = new Map<string, { at: [number, number, number]; faces: Set<number> }>();
  const note = (x: number, y: number, z: number, faces: Set<number>) => {
    const key = `${Math.round(x / WELD)},${Math.round(y / WELD)},${Math.round(z / WELD)}`;
    const found = meeting.get(key);
    if (found === undefined) meeting.set(key, { at: [x, y, z], faces: new Set(faces) });
    else for (const face of faces) found.faces.add(face);
  };
  for (let seam = 0; seam < table.count; seam++) {
    const faces = facesOf(table, seam);
    const e = table.ends;
    const i = seam * 6;
    note(e[i] ?? 0, e[i + 1] ?? 0, e[i + 2] ?? 0, faces);
    note(e[i + 3] ?? 0, e[i + 4] ?? 0, e[i + 5] ?? 0, faces);
  }
  const corners = new Map<string, [number, number, number]>();
  for (const point of meeting.values()) {
    if (point.faces.size < 3) continue;
    corners.set([...point.faces].sort((a, b) => a - b).join(','), point.at);
  }
  return corners;
}

/** Seams between random points of a small lattice, so their ends meet, with faces either side. */
function randomSeams(count: number, seed: number): SeamTable {
  let state = seed;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const point = () => [Math.floor(next() * 6), Math.floor(next() * 6), Math.floor(next() * 3)];
  const ends = new Float32Array(count * 6);
  const first = new Int32Array(count);
  const second = new Int32Array(count);
  const more = new Map<number, number[]>();
  for (let s = 0; s < count; s++) {
    // A hair of float noise, well inside one weld cell.
    ends.set(
      [...point(), ...point()].map((v) => v * 2 + (next() - 0.5) * WELD * 0.2),
      s * 6,
    );
    first[s] = Math.floor(next() * 40);
    second[s] = next() < 0.1 ? -1 : Math.floor(next() * 40);
    if (next() < 0.03) more.set(s, [Math.floor(next() * 40)]);
  }
  return { count, ends, first, second, more };
}

describe('corners from seams', () => {
  it('finds the corners the text-keyed version found, at the same points', () => {
    for (const seed of [1, 7, 42]) {
      const table = randomSeams(400, seed);
      const expected = cornersByText(table);
      expect(expected.size).toBeGreaterThan(0);
      // From the seams here, and from a table as the geometry worker builds and hands over.
      for (const picker of [new CornerPicker(table), new CornerPicker(buildCorners(table))]) {
        for (const [faces, at] of expected) {
          const corner = picker.cornerOf(faces.split(',').map(Number));
          expect(corner?.faces.join(',')).toBe(faces);
          expect([corner?.x, corner?.y, corner?.z]).toEqual(at);
        }
      }
      expect(buildCorners(table).count).toBe(expected.size);
    }
  });

  it('finds no corner where only two faces meet', () => {
    // Two seams of the same two faces meeting at a point: a bend in an edge, not a corner.
    const table: SeamTable = {
      count: 2,
      ends: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0]),
      first: Int32Array.from([0, 0]),
      second: Int32Array.from([1, 1]),
      more: new Map(),
    };
    expect(new CornerPicker(table).cornerOf([0, 1])).toBeNull();
  });
});
