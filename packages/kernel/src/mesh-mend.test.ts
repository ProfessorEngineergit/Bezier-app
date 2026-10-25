import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stlOf } from './export-parts.js';
import { meshPiece, type Piece } from './tessellation.js';
import { loadOcct } from './wasm.js';

/**
 * Two parts of the Voron assembly whose cones OCCT's mesher drops at the app's own setting. Without
 * the repair `meshShape` returns them with a face missing (the caps of the curved clips) and an
 * exported STL has a hole there.
 */
const SETTING = { linearDeflection: 0.2, angularDeflection: 0.5 };

function load(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../test-data/${name}`, import.meta.url)));
}

function meshedArea(piece: Piece): number {
  const { positions: p, indices: ix } = piece;
  let total = 0;
  for (let i = 0; i + 2 < ix.length; i += 3) {
    const a = (ix[i] ?? 0) * 3;
    const b = (ix[i + 1] ?? 0) * 3;
    const c = (ix[i + 2] ?? 0) * 3;
    const ux = (p[b] ?? 0) - (p[a] ?? 0);
    const uy = (p[b + 1] ?? 0) - (p[a + 1] ?? 0);
    const uz = (p[b + 2] ?? 0) - (p[a + 2] ?? 0);
    const vx = (p[c] ?? 0) - (p[a] ?? 0);
    const vy = (p[c + 1] ?? 0) - (p[a + 1] ?? 0);
    const vz = (p[c + 2] ?? 0) - (p[a + 2] ?? 0);
    total += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  return total;
}

/** Triangle edges used once, with vertices at one place counted as one. */
function openEdges(piece: Piece): number {
  const ids = new Map<string, number>();
  const idOf = (v: number): number => {
    const key = [0, 1, 2].map((o) => Math.round((piece.positions[v * 3 + o] ?? 0) * 100)).join(',');
    const known = ids.get(key);
    if (known !== undefined) return known;
    ids.set(key, ids.size);
    return ids.size - 1;
  };
  const uses = new Map<string, number>();
  for (let t = 0; t < piece.indices.length; t += 3) {
    const v = [0, 1, 2].map((o) => idOf(piece.indices[t + o] ?? 0));
    for (const [i, j] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const) {
      const p = v[i] ?? 0;
      const q = v[j] ?? 0;
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const count of uses.values()) if (count === 1) open++;
  return open;
}

describe('a part whose cones the mesher gives up on', { timeout: 60_000 }, () => {
  it('is meshed whole, every edge shared, when the angle is opened for the whole part', async () => {
    const occt = await loadOcct();
    const solid = occt.fromBREPBinary(load('clip-three-cones.brep'));
    const piece = meshPiece(occt, solid, SETTING);
    // Three faces of this part come back from the mesher empty at 0.5 radians.
    expect(piece.runs.length / 3).toBe(occt.subShapeCount(solid, 'face'));
    expect(meshedArea(piece) / occt.getSurfaceArea(solid)).toBeGreaterThan(0.99);
    expect(openEdges(piece)).toBe(0);
  });

  it('gets the face the whole-part retry cannot mesh from a mesh of its own', async () => {
    const occt = await loadOcct();
    const solid = occt.fromBREPBinary(load('clip-cap-cone.brep'));
    const piece = meshPiece(occt, solid, SETTING);
    expect(piece.runs.length / 3).toBe(occt.subShapeCount(solid, 'face'));
    // Within a percent of the part's own area: the cone that was a hole of eight square millimetres
    // in a part of three hundred and fifty.
    expect(meshedArea(piece) / occt.getSurfaceArea(solid)).toBeGreaterThan(0.98);
  });

  it('is written to STL with the repaired face in it, as the mesh shows it', async () => {
    const occt = await loadOcct();
    const solid = occt.fromBREPBinary(load('clip-cap-cone.brep'));
    const piece = meshPiece(occt, solid, SETTING);
    const stl = stlOf(piece);
    expect(new DataView(stl.buffer).getUint32(80, true)).toBe(piece.indices.length / 3);
    expect(stl.length).toBe(84 + (piece.indices.length / 3) * 50);
  });

  it('leaves a part the mesher handles alone', async () => {
    const occt = await loadOcct();
    const box = occt.makeBox(10, 10, 10);
    const piece = meshPiece(occt, box, SETTING);
    expect(piece.indices.length / 3).toBe(12);
    expect(openEdges(piece)).toBe(0);
  });
});
