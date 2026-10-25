/**
 * Corner picking: points where three or more named faces meet (`VertexRef`), found from the seams
 * by the same rule as `Outliner.cornersOf`. Only corners of faces near the cursor are tested, so
 * hover cost does not grow with the model.
 */

import { Vector3 } from 'three';
import type { ActiveCamera } from './camera.js';
import { buildCorners, type CornerTable } from './corner-table.js';
import type { Outliner } from './outline.js';
import type { SeamTable } from './seams.js';

export interface Corner {
  x: number;
  y: number;
  z: number;
  /** Indices of the faces that meet here, at least three. */
  faces: readonly number[];
}

/** Hoisted so a hover allocates nothing. */
const projected = new Vector3();

export class CornerPicker {
  readonly #table: CornerTable;
  /** Corners handed out so far, made once each. */
  readonly #made = new Map<number, Corner>();

  /** From a table built elsewhere (`corner-table.ts`), or from the seams here. */
  constructor(table: CornerTable | SeamTable) {
    this.#table = 'byFace' in table ? table : buildCorners(table);
  }

  #corner(index: number): Corner {
    const known = this.#made.get(index);
    if (known !== undefined) return known;
    const t = this.#table;
    const faces = Array.from(
      t.faces.subarray(t.faceStarts[index] ?? 0, t.faceStarts[index + 1] ?? 0),
    );
    const corner = {
      x: t.points[index * 3] ?? 0,
      y: t.points[index * 3 + 1] ?? 0,
      z: t.points[index * 3 + 2] ?? 0,
      faces,
    };
    this.#made.set(index, corner);
    return corner;
  }

  /** The corners on `face`, as indices into the table. */
  #on(face: number): Uint32Array {
    const t = this.#table;
    if (face < 0 || face + 1 >= t.byFaceStarts.length) return EMPTY;
    return t.byFace.subarray(t.byFaceStarts[face] ?? 0, t.byFaceStarts[face + 1] ?? 0);
  }

  /** The corner whose faces are exactly these, or null. */
  cornerOf(faces: readonly number[]): Corner | null {
    const [first] = faces;
    if (first === undefined) return null;
    const wanted = [...faces].sort((a, b) => a - b);
    const t = this.#table;
    for (const index of this.#on(first)) {
      const from = t.faceStarts[index] ?? 0;
      if ((t.faceStarts[index + 1] ?? 0) - from !== wanted.length) continue;
      if (wanted.every((face, k) => t.faces[from + k] === face)) return this.#corner(index);
    }
    return null;
  }

  /**
   * The visible corner of one of `faces` nearest the cursor within the NDC ellipse of radii `rx`,
   * `ry`, or null.
   */
  near(
    camera: ActiveCamera,
    ndcX: number,
    ndcY: number,
    rx: number,
    ry: number,
    faces: Int32Array,
    count: number,
    visible: (x: number, y: number, z: number) => boolean,
  ): Corner | null {
    const points = this.#table.points;
    let best = -1;
    let bestDistance = 1;
    for (let f = 0; f < count; f++) {
      for (const index of this.#on(faces[f] ?? -1)) {
        const x = points[index * 3] ?? 0;
        const y = points[index * 3 + 1] ?? 0;
        const z = points[index * 3 + 2] ?? 0;
        projected.set(x, y, z).project(camera);
        const dx = (projected.x - ndcX) / rx;
        const dy = (projected.y - ndcY) / ry;
        const distance = dx * dx + dy * dy;
        if (distance >= bestDistance) continue;
        if (!visible(x, y, z)) continue;
        best = index;
        bestDistance = distance;
      }
    }
    return best < 0 ? null : this.#corner(best);
  }
}

const EMPTY = new Uint32Array(0);

/** A picked corner drawn about eight pixels across, at the size it has where it stands. */
export function markCorner(
  outline: Outliner,
  corner: Corner,
  eye: { x: number; y: number; z: number },
  view: { worldPerPixelAt(distance: number): number },
): void {
  const away = Math.hypot(eye.x - corner.x, eye.y - corner.y, eye.z - corner.z);
  outline.showCorner(corner.x, corner.y, corner.z, view.worldPerPixelAt(away) * 8);
}
