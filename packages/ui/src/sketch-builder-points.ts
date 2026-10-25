/**
 * Adds external geometry (imported drawings, projected edges) to a sketch with non-clashing ids
 * and shared points where ends meet, so imported outlines are connected and their areas close.
 */

import type { Sketch, SketchId, SketchPrimitive } from '@bezier/solver';

type P = { x: number; y: number };

export class SketchAdder {
  readonly #taken: Set<SketchId>;
  readonly #points: { id: SketchId; x: number; y: number }[] = [];
  readonly added: SketchPrimitive[] = [];
  readonly #tolerance: number;

  constructor(sketch: Sketch, tolerance = 1e-4) {
    this.#taken = new Set(sketch.primitives.map((primitive) => primitive.id));
    this.#tolerance = tolerance;
  }

  fresh(prefix: string): SketchId {
    let n = 1;
    while (this.#taken.has(`${prefix}${n}`)) n += 1;
    this.#taken.add(`${prefix}${n}`);
    return `${prefix}${n}`;
  }

  point(p: P): SketchId {
    const near = this.#points.find((q) => Math.hypot(q.x - p.x, q.y - p.y) < this.#tolerance);
    if (near !== undefined) return near.id;
    const id = this.fresh('ip');
    this.#points.push({ id, x: p.x, y: p.y });
    this.added.push({ kind: 'point', id, x: p.x, y: p.y });
    return id;
  }

  line(a: P, b: P, construction = false): void {
    if (Math.hypot(a.x - b.x, a.y - b.y) < this.#tolerance) return;
    this.added.push({
      kind: 'line',
      id: this.fresh('il'),
      start: this.point(a),
      end: this.point(b),
      ...(construction ? { construction: true } : {}),
    });
  }

  circle(centre: P, radius: number, construction = false): void {
    if (!(radius > 0)) return;
    this.added.push({
      kind: 'circle',
      id: this.fresh('ic'),
      center: this.point(centre),
      radius,
      ...(construction ? { construction: true } : {}),
    });
  }

  /** An arc counter-clockwise from `start` to `end` round `centre`. */
  arc(centre: P, start: P, end: P, construction = false): void {
    this.added.push({
      kind: 'arc',
      id: this.fresh('ia'),
      center: this.point(centre),
      start: this.point(start),
      end: this.point(end),
      ...(construction ? { construction: true } : {}),
    });
  }

  into(sketch: Sketch): Sketch {
    return this.added.length === 0
      ? sketch
      : { ...sketch, primitives: [...sketch.primitives, ...this.added] };
  }
}
