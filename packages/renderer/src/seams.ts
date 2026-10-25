/**
 * Seams of a mesh (edges between different faces), for the picked-face and edge outline
 * (`outline.ts`). Only edges between faces are kept, in typed arrays with numeric keys.
 *
 * 1. Inside a face, by vertex index. OCCT shares vertices within a face and splits them along its
 *    border, so an edge used by only one triangle of the face is on its border.
 * 2. Across faces, by position. Border edges are matched by their endpoints, welded to a tenth of a
 *    micron (`Welder`).
 */

import type { Mesh } from '@bezier/kernel';
import { pairLooseBorders } from './seam-neighbours.js';

/** How finely positions are rounded before they are matched, in millimetres. */
export const WELD = 1e-4;

/** One seam between faces, as the outline's callers take it. */
export interface Seam {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  faces: Set<number>;
}

/** Every seam of a mesh, in flat arrays. */
export interface SeamTable {
  count: number;
  /** Six floats per seam: its two ends. */
  ends: Float32Array;
  /** The faces either side. `second` is -1 along a border only one face has. */
  first: Int32Array;
  second: Int32Array;
  /** The rare seam more than two faces meet along, and the faces past two. */
  more: Map<number, number[]>;
  /** How far apart two ends may be and still be one point, for this mesh (`weldFor`). */
  weld?: number;
}

/**
 * The weld for a mesh. Positions are float32, good to 6e-5 mm at 1,000 mm from the origin and 1e-3
 * at 10,000 mm, so the weld grows with the mesh's reach, never below `WELD`.
 */
export function weldFor(positions: ArrayLike<number>): number {
  let reach = 0;
  for (let i = 0; i < positions.length; i++) {
    const v = Math.abs(positions[i] ?? 0);
    if (v > reach) reach = v;
  }
  return Math.max(WELD, reach * 1.5e-6);
}

/** Open addressing over three integer cell coordinates. */
export class CellTable {
  #mask = 0;
  #x = new Int32Array(0);
  #y = new Int32Array(0);
  #z = new Int32Array(0);
  #id = new Int32Array(0);
  #size = 0;

  constructor(capacity = 1024) {
    this.#allocate(capacity);
  }

  get(x: number, y: number, z: number): number {
    let slot = hash3(x, y, z) & this.#mask;
    for (;;) {
      const id = this.#id[slot] ?? -1;
      if (id < 0) return -1;
      if (this.#x[slot] === x && this.#y[slot] === y && this.#z[slot] === z) return id;
      slot = (slot + 1) & this.#mask;
    }
  }

  set(x: number, y: number, z: number, id: number): void {
    if ((this.#size + 1) * 2 > this.#mask + 1) this.#grow();
    let slot = hash3(x, y, z) & this.#mask;
    for (;;) {
      const found = this.#id[slot] ?? -1;
      if (found < 0) {
        this.#x[slot] = x;
        this.#y[slot] = y;
        this.#z[slot] = z;
        this.#id[slot] = id;
        this.#size++;
        return;
      }
      if (this.#x[slot] === x && this.#y[slot] === y && this.#z[slot] === z) {
        this.#id[slot] = id;
        return;
      }
      slot = (slot + 1) & this.#mask;
    }
  }

  #allocate(capacity: number): void {
    let size = 16;
    while (size < capacity) size *= 2;
    this.#mask = size - 1;
    this.#x = new Int32Array(size);
    this.#y = new Int32Array(size);
    this.#z = new Int32Array(size);
    this.#id = new Int32Array(size).fill(-1);
    this.#size = 0;
  }

  #grow(): void {
    const [xs, ys, zs, ids] = [this.#x, this.#y, this.#z, this.#id];
    this.#allocate((this.#mask + 1) * 2);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i] ?? -1;
      if (id >= 0) this.set(xs[i] ?? 0, ys[i] ?? 0, zs[i] ?? 0, id);
    }
  }
}

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ Math.imul(z, 0xc2b2ae3d);
  h ^= h >>> 15;
  return Math.imul(h, 0x27d4eb2f) >>> 0;
}

/**
 * Assigns one id per welded position. A point is looked up in its own cell and the seven neighbours
 * it leans towards, so any two points within half a cell on every axis match regardless of cell
 * boundaries (two offset grids miss pairs that straddle boundaries on two axes). Cells are 32-bit,
 * enough for a model about 200 m across at this resolution.
 */
export class Welder {
  readonly #cells: CellTable;
  #next = 0;

  readonly #weld: number;

  constructor(capacity = 1024, weld = WELD) {
    this.#cells = new CellTable(capacity);
    this.#weld = weld;
  }

  id(x: number, y: number, z: number): number {
    const fx = x / this.#weld;
    const fy = y / this.#weld;
    const fz = z / this.#weld;
    const px = Math.round(fx);
    const py = Math.round(fy);
    const pz = Math.round(fz);
    // The neighbour each coordinate leans towards, the only one it can be within half a cell of.
    const nx = px + (fx >= px ? 1 : -1);
    const ny = py + (fy >= py ? 1 : -1);
    const nz = pz + (fz >= pz ? 1 : -1);
    let found = this.#cells.get(px, py, pz);
    for (let i = 1; found < 0 && i < 8; i++) {
      found = this.#cells.get(i & 1 ? nx : px, i & 2 ? ny : py, i & 4 ? nz : pz);
    }
    const id = found >= 0 ? found : this.#next++;
    this.#cells.set(px, py, pz, id);
    return id;
  }
}

/** Open addressing from a numeric key to an int, cleared in O(1) between faces. */
class KeyTable {
  #mask = 0;
  #keys = new Float64Array(0);
  #values = new Int32Array(0);
  #stamps = new Uint32Array(0);
  #stamp = 1;
  /** The slots filled since the last clear, so they can be walked. */
  used = new Int32Array(0);
  usedCount = 0;

  /** Empty the table, with room for at least `capacity` keys. */
  clear(capacity: number): void {
    let size = 16;
    while (size < capacity * 2) size *= 2;
    if (size > this.#mask + 1) {
      this.#mask = size - 1;
      this.#keys = new Float64Array(size);
      this.#values = new Int32Array(size);
      this.#stamps = new Uint32Array(size);
      this.used = new Int32Array(size);
      this.#stamp = 1;
    } else {
      this.#stamp++;
    }
    this.usedCount = 0;
  }

  /** The slot holding `key`, or -1. */
  find(key: number): number {
    let slot = hashKey(key) & this.#mask;
    for (;;) {
      if (this.#stamps[slot] !== this.#stamp) return -1;
      if (this.#keys[slot] === key) return slot;
      slot = (slot + 1) & this.#mask;
    }
  }

  /** Put `key` in, returning its slot; `value` is set only when it is new. */
  insert(key: number, value: number): number {
    if ((this.usedCount + 1) * 2 > this.#mask + 1) this.#grow();
    let slot = hashKey(key) & this.#mask;
    for (;;) {
      if (this.#stamps[slot] !== this.#stamp) {
        this.#stamps[slot] = this.#stamp;
        this.#keys[slot] = key;
        this.#values[slot] = value;
        this.used[this.usedCount++] = slot;
        return slot;
      }
      if (this.#keys[slot] === key) return slot;
      slot = (slot + 1) & this.#mask;
    }
  }

  value(slot: number): number {
    return this.#values[slot] ?? -1;
  }

  setValue(slot: number, value: number): void {
    this.#values[slot] = value;
  }

  #grow(): void {
    const keys = this.#keys;
    const values = this.#values;
    const used = this.used.slice(0, this.usedCount);
    this.#mask = 0;
    this.clear((this.#mask + 1 + keys.length) * 2);
    for (const slot of used) this.insert(keys[slot] ?? 0, values[slot] ?? -1);
  }
}

function hashKey(key: number): number {
  const low = key >>> 0;
  const high = Math.floor(key / 4294967296) >>> 0;
  let h = Math.imul(low, 0x9e3779b1) ^ Math.imul(high ^ 0x7feb352d, 0x846ca68b);
  h ^= h >>> 16;
  return Math.imul(h, 0x21f0aaad) >>> 0;
}

/** Growable flat storage for the seams as they are found. */
class Seams {
  count = 0;
  ends = new Float32Array(6 * 1024);
  first = new Int32Array(1024);
  second = new Int32Array(1024);
  readonly more = new Map<number, number[]>();

  add(ends: readonly number[], face: number): number {
    if (this.count === this.first.length) {
      const grow = (from: Int32Array) => {
        const to = new Int32Array(from.length * 2);
        to.set(from);
        return to;
      };
      this.first = grow(this.first);
      this.second = grow(this.second);
      const wider = new Float32Array(this.ends.length * 2);
      wider.set(this.ends);
      this.ends = wider;
    }
    const seam = this.count++;
    this.ends.set(ends, seam * 6);
    this.first[seam] = face;
    this.second[seam] = -1;
    return seam;
  }
}

/** Largest vertex index a pair key can hold without losing precision. */
const PAIR = 2 ** 26;

export function buildSeams(mesh: Mesh): SeamTable {
  const { positions, indices, triangleFaces } = mesh;
  const vertices = Math.max(1, positions.length / 3);
  const triangles = triangleFaces.length;
  const inside = new KeyTable();
  const between = new KeyTable();
  between.clear(1024);
  const weld = weldFor(positions);
  const welder = new Welder(4096, weld);
  const seams = new Seams();
  const ends = [0, 0, 0, 0, 0, 0];

  let start = 0;
  while (start < triangles) {
    const face = triangleFaces[start] ?? 0;
    let end = start + 1;
    while (end < triangles && triangleFaces[end] === face) end++;

    // Step 1: which of this run's edges only one of its triangles has.
    inside.clear((end - start) * 3);
    for (let t = start; t < end; t++) {
      for (let e = 0; e < 3; e++) {
        const a = indices[t * 3 + e] ?? 0;
        const b = indices[t * 3 + ((e + 1) % 3)] ?? 0;
        const key = a < b ? a * vertices + b : b * vertices + a;
        const slot = inside.insert(key, t * 3 + e);
        // Seen before: shared inside the face, so not a seam.
        if (inside.value(slot) !== t * 3 + e) inside.setValue(slot, -1);
      }
    }

    // Step 2: match the border edges with other faces' by position.
    for (let u = 0; u < inside.usedCount; u++) {
      const edge = inside.value(inside.used[u] ?? 0);
      if (edge < 0) continue;
      const t = Math.floor(edge / 3);
      const e = edge - t * 3;
      const i = (indices[t * 3 + e] ?? 0) * 3;
      const j = (indices[t * 3 + ((e + 1) % 3)] ?? 0) * 3;
      ends[0] = positions[i] ?? 0;
      ends[1] = positions[i + 1] ?? 0;
      ends[2] = positions[i + 2] ?? 0;
      ends[3] = positions[j] ?? 0;
      ends[4] = positions[j + 1] ?? 0;
      ends[5] = positions[j + 2] ?? 0;
      const one = welder.id(ends[0], ends[1], ends[2]);
      const two = welder.id(ends[3], ends[4], ends[5]);
      if (one === two || one >= PAIR || two >= PAIR) continue;
      const key = one < two ? one * PAIR + two : two * PAIR + one;
      const slot = between.insert(key, -1);
      const seam = between.value(slot);
      if (seam < 0) {
        between.setValue(slot, seams.add(ends, face));
        continue;
      }
      const first = seams.first[seam] ?? -1;
      const second = seams.second[seam] ?? -1;
      // Same face on both sides: its triangles came in two runs, so this edge is interior.
      if (first === face || second === face) continue;
      if (second < 0) {
        seams.second[seam] = face;
        continue;
      }
      const further = seams.more.get(seam) ?? [];
      if (!further.includes(face)) further.push(face);
      seams.more.set(seam, further);
    }
    start = end;
  }

  const table: SeamTable = {
    count: seams.count,
    ends: seams.ends,
    first: seams.first,
    second: seams.second,
    more: seams.more,
    weld,
  };
  // Step 3: borders still alone, where the two sides were tessellated apart (seam-neighbours.ts).
  pairLooseBorders(table);
  return table;
}

/** The faces meeting along one seam. */
export function facesOf(table: SeamTable, seam: number): Set<number> {
  const faces = new Set<number>([table.first[seam] ?? -1]);
  const second = table.second[seam] ?? -1;
  if (second >= 0) faces.add(second);
  for (const face of table.more.get(seam) ?? []) faces.add(face);
  return faces;
}

/** One seam as an object, for the few callers that want one. */
export function seamAt(table: SeamTable, seam: number): Seam {
  const at = seam * 6;
  const ends = table.ends;
  return {
    ax: ends[at] ?? 0,
    ay: ends[at + 1] ?? 0,
    az: ends[at + 2] ?? 0,
    bx: ends[at + 3] ?? 0,
    by: ends[at + 4] ?? 0,
    bz: ends[at + 5] ?? 0,
    faces: facesOf(table, seam),
  };
}
