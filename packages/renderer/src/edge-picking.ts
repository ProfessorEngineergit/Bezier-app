/** Screen tolerance applies to whole CAD seams, never to their tessellation vertices. */
import { formatRef, type StableRef } from '@bezier/core';
import { Vector3 } from 'three';
import type { ActiveCamera } from './camera.js';
import type { SeamTable } from './seams.js';

interface Visibility {
  pointVisible(camera: ActiveCamera, x: number, y: number, z: number): boolean;
}

export class EdgePicker {
  readonly #table: SeamTable;
  readonly #starts: Uint32Array;
  readonly #segments: Uint32Array;
  readonly #a = new Vector3();
  readonly #b = new Vector3();
  readonly hit = { first: -1, second: -1, x: 0, y: 0, z: 0 };

  constructor(table: SeamTable, refs: readonly (StableRef | null)[]) {
    this.#table = table;
    // Each face's name as a number, the same number for the same name: compared per seam, and an
    // assembly has millions of seams. -1 for a face with no name.
    const ids = new Map<string, number>();
    const names = new Int32Array(refs.length).fill(-1);
    refs.forEach((ref, face) => {
      if (ref?.kind !== 'face') return;
      const name = formatRef(ref);
      let id = ids.get(name);
      if (id === undefined) {
        id = ids.size;
        ids.set(name, id);
      }
      names[face] = id;
    });
    this.#starts = new Uint32Array(refs.length + 1);
    const usable = new Uint8Array(table.count);
    for (let s = 0; s < table.count; s++) {
      const a = table.first[s] ?? -1,
        b = table.second[s] ?? -1;
      if (a < 0 || b < 0 || table.more.has(s)) continue;
      const nameA = names[a] ?? -1,
        nameB = names[b] ?? -1;
      if (nameA < 0 || nameB < 0 || nameA === nameB) continue;
      usable[s] = 1;
      this.#starts[a + 1] = (this.#starts[a + 1] ?? 0) + 1;
      this.#starts[b + 1] = (this.#starts[b + 1] ?? 0) + 1;
    }
    for (let i = 1; i < this.#starts.length; i++)
      this.#starts[i] = (this.#starts[i] ?? 0) + (this.#starts[i - 1] ?? 0);
    this.#segments = new Uint32Array(this.#starts.at(-1) ?? 0);
    const at = this.#starts.slice();
    for (let s = 0; s < table.count; s++) {
      if (usable[s] !== 1) continue;
      const a = table.first[s] ?? 0,
        b = table.second[s] ?? 0;
      const atA = at[a] ?? 0;
      this.#segments[atA] = s;
      at[a] = atA + 1;
      const atB = at[b] ?? 0;
      this.#segments[atB] = s;
      at[b] = atB + 1;
    }
  }

  near(
    camera: ActiveCamera,
    x: number,
    y: number,
    rx: number,
    ry: number,
    faces: Int32Array,
    count: number,
    probe: Visibility,
  ): boolean {
    let best = 1;
    let depth = Infinity;
    this.hit.first = -1;
    const e = this.#table.ends;
    for (let f = 0; f < count; f++) {
      const face = faces[f] ?? -1;
      if (face < 0) continue;
      for (let i = this.#starts[face] ?? 0; i < (this.#starts[face + 1] ?? 0); i++) {
        const seam = this.#segments[i] ?? 0,
          offset = seam * 6;
        const ax = e[offset] ?? 0,
          ay = e[offset + 1] ?? 0,
          az = e[offset + 2] ?? 0;
        const bx = e[offset + 3] ?? 0,
          by = e[offset + 4] ?? 0,
          bz = e[offset + 5] ?? 0;
        // Screen interpolation is perspective-corrected before the world-space depth probe.
        const m = camera.matrixWorldInverse.elements;
        const wa = -(m[2] * ax + m[6] * ay + m[10] * az + m[14]);
        const wb = -(m[2] * bx + m[6] * by + m[10] * bz + m[14]);
        this.#a.set(ax, ay, az).project(camera);
        this.#b.set(bx, by, bz).project(camera);
        if (this.#a.z < -1 || this.#b.z < -1 || this.#a.z > 1 || this.#b.z > 1) continue;
        const dx = (this.#b.x - this.#a.x) / rx,
          dy = (this.#b.y - this.#a.y) / ry;
        const length = dx * dx + dy * dy;
        const t =
          length === 0
            ? 0
            : Math.max(
                0,
                Math.min(1, (((x - this.#a.x) / rx) * dx + ((y - this.#a.y) / ry) * dy) / length),
              );
        const sx = (this.#a.x - x) / rx + t * dx,
          sy = (this.#a.y - y) / ry + t * dy;
        const distance = sx * sx + sy * sy;
        const z = this.#a.z + (this.#b.z - this.#a.z) * t;
        if (distance > best + 1e-9 || (Math.abs(distance - best) < 1e-9 && z >= depth)) continue;
        const perspective = camera.type === 'PerspectiveCamera';
        const worldT = perspective ? (t * wa) / ((1 - t) * wb + t * wa) : t;
        const px = ax + (bx - ax) * worldT,
          py = ay + (by - ay) * worldT,
          pz = az + (bz - az) * worldT;
        if (!probe.pointVisible(camera, px, py, pz)) continue;
        best = distance;
        depth = z;
        this.hit.first = this.#table.first[seam] ?? -1;
        this.hit.second = this.#table.second[seam] ?? -1;
        this.hit.x = px;
        this.hit.y = py;
        this.hit.z = pz;
      }
    }
    return this.hit.first >= 0;
  }
}
