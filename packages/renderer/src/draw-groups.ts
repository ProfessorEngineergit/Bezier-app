/**
 * Bookkeeping for drawing one mesh part by part (`lod-body.ts`): draw groups rewritten each frame
 * without allocating, and highlight colours mirrored onto a second drawing of some parts.
 */

import type { Mesh } from '@bezier/kernel';
import type { BufferGeometry, GeometryGroup } from 'three';
import type { FaceColour } from './highlight.js';

/** Draw groups set in place from a list of runs, reusing their objects. */
export class Groups {
  readonly #pool: GeometryGroup[] = [];
  readonly #whole = new Uint32Array(2);
  readonly #geometry: BufferGeometry;

  constructor(geometry: BufferGeometry) {
    this.#geometry = geometry;
  }

  set(pairs: Uint32Array, count: number): void {
    const groups = this.#geometry.groups;
    for (let i = 0; i < count; i++) {
      let group = this.#pool[i];
      if (group === undefined) {
        group = { start: 0, count: 0, materialIndex: 0 };
        this.#pool.push(group);
      }
      group.start = pairs[i * 2] ?? 0;
      group.count = pairs[i * 2 + 1] ?? 0;
      groups[i] = group;
    }
    groups.length = count;
  }

  whole(count: number): void {
    const pair = this.#whole;
    pair[1] = count;
    this.set(pair, 1);
  }
}

/**
 * Paints a face of another drawing, for `Highlighter.addMirror`. That drawing holds a few of the
 * body's faces under the body's numbering, so its index is a map, not an array.
 */
export function painter(
  mesh: Mesh,
  geometry: BufferGeometry,
): (face: number, colour: FaceColour) => void {
  const count = new Map<number, number>();
  for (const face of mesh.triangleFaces) count.set(face, (count.get(face) ?? 0) + 3);
  const start = new Map<number, number>();
  let total = 0;
  for (const [face, n] of count) {
    start.set(face, total);
    total += n;
  }
  const vertices = new Uint32Array(total);
  const cursor = new Map(start);
  mesh.triangleFaces.forEach((face, t) => {
    let at = cursor.get(face) ?? 0;
    for (let k = 0; k < 3; k++) vertices[at++] = mesh.indices[t * 3 + k] ?? 0;
    cursor.set(face, at);
  });
  const colours = geometry.getAttribute('color');
  return (face, colour) => {
    const from = start.get(face);
    if (from === undefined) return;
    const to = from + (count.get(face) ?? 0);
    const array = colours.array as Float32Array;
    for (let i = from; i < to; i++) {
      const vertex = (vertices[i] ?? 0) * 3;
      array[vertex] = colour[0];
      array[vertex + 1] = colour[1];
      array[vertex + 2] = colour[2];
    }
    colours.needsUpdate = true;
  };
}
