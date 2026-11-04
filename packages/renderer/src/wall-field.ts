/** Wall thickness as a result on the model, and what it found. */

import type { Mesh } from '@bezier/kernel';
import type { ResultField } from './result-overlay.js';

/** Measured once per mesh: moving the limit only repaints. */
export class WallMeasure {
  #measured: { mesh: Mesh; values: Float32Array } | null = null;

  at(mesh: Mesh, limit: number, measure: (mesh: Mesh) => Float32Array | null) {
    if (this.#measured?.mesh !== mesh) {
      const values = measure(mesh);
      this.#measured = values === null ? null : { mesh, values };
    }
    return this.#measured === null ? null : wallField(this.#measured.values, limit);
  }
}

export function wallField(walls: Float32Array, limit: number) {
  let thinnest = Number.POSITIVE_INFINITY;
  let thin = 0;
  for (const wall of walls) {
    if (wall < thinnest) thinnest = wall;
    if (wall < limit) thin += 1;
  }
  // On the safety ramp the limit lands on amber: red under it, green from twice it.
  const field: ResultField = {
    values: walls.map((wall) => Math.min(wall, limit * 3)),
    displacement: null,
    min: 0,
    max: limit * 3,
    bands: 0,
    palette: 'safety',
  };
  return { field, found: { thinnest, thin: thin / walls.length } };
}
