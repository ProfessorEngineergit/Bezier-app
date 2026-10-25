/**
 * Nib's mouth: a glowing line behind the face glass. Not in the model file because it is defined by
 * three numbers (smile, width, thickness): the film's Bézier, rebuilt as a thin tube when they
 * change.
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three';

/** The trailer's mouth tuning: wider and flatter than the model's original. */
const WIDE = 1.67;
const CURVE = 0.7;
const DROP = 0.0035;
const HALF_WIDTH = 0.0158;
const RADIUS = 0.00125;
const SEGMENTS = 24;
const AROUND = 6;
/**
 * The mouth node is scaled to 0.35 in depth, so this is 2.6 mm in front of it, enough to sit in
 * front of the glass, which would otherwise hide it.
 */
const IN_FRONT = 0.0075;

export const MOUTH_VERTEX_COUNT = (SEGMENTS + 1) * AROUND;

/**
 * Writes the tube's vertices (x, y in the mouth plane, z thickness) into `out`. Pure, for tests.
 */
export function writeMouth(smile: number, width: number, thick: number, out: Float32Array): void {
  const wide = 1 + (WIDE - 1) * Math.min(1, Math.max(0, (width - 0.4) / 0.5));
  const half = HALF_WIDTH * width * wide;
  const curve = smile * CURVE;
  const corner = -0.002 + 0.006 * curve - DROP;
  const middle = -0.002 - 0.0058 * curve - DROP;
  const radius = RADIUS * thick;
  const x0 = -half;
  const x1 = -0.557 * half;
  const x2 = 0.557 * half;
  const x3 = half;
  let o = 0;
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    const x = a * x0 + b * x1 + c * x2 + d * x3;
    const y = a * corner + (b + c) * middle + d * corner;
    const dx = 3 * u * u * (x1 - x0) + 6 * u * t * (x2 - x1) + 3 * t * t * (x3 - x2);
    const dy = 3 * u * u * (middle - corner) + 3 * t * t * (corner - middle);
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    // The ends narrow to a round tip.
    const taper = Math.min(1, 0.25 + 4 * Math.min(t, 1 - t));
    for (let j = 0; j < AROUND; j++) {
      const angle = (j / AROUND) * Math.PI * 2;
      const across = Math.cos(angle) * radius * taper;
      out[o++] = x + nx * across;
      out[o++] = y + ny * across;
      out[o++] = Math.sin(angle) * radius * taper;
    }
  }
}

export class Mouth {
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly #data = new Float32Array(MOUTH_VERTEX_COUNT * 3);
  readonly #positions = new BufferAttribute(this.#data, 3);
  #last = '';

  constructor(parent: Object3D) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', this.#positions);
    const index: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      for (let j = 0; j < AROUND; j++) {
        const a = i * AROUND + j;
        const b = i * AROUND + ((j + 1) % AROUND);
        const c = (i + 1) * AROUND + j;
        const d = (i + 1) * AROUND + ((j + 1) % AROUND);
        index.push(a, c, b, b, c, d);
      }
    }
    geometry.setIndex(index);
    // Brighter than white and not tone-mapped: it is a light, not a surface.
    const material = new MeshBasicMaterial({
      color: new Color(0.55, 0.9, 1).multiplyScalar(1.9),
      toneMapped: false,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.position.z = IN_FRONT;
    parent.add(this.mesh);
  }

  /** Rebuilds the tube only when the values actually changed. */
  set(smile: number, width: number, thick: number): void {
    const key = `${smile.toFixed(3)}|${width.toFixed(3)}|${thick.toFixed(3)}`;
    if (key === this.#last) return;
    this.#last = key;
    writeMouth(smile, width, thick, this.#data);
    this.#positions.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}
