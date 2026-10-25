/** Hit the displayed simulation surface and interpolate the same vertex field as its shader. */
import type { Mesh } from '@bezier/kernel';
import {
  BufferAttribute,
  BufferGeometry,
  type Camera,
  DoubleSide,
  type Intersection,
  MeshBasicMaterial,
  Raycaster,
  Mesh as ThreeMesh,
  Triangle,
  Vector2,
  Vector3,
} from 'three';
import type { ResultField } from './result-overlay.js';
export class ResultProbe {
  readonly #geometry = new BufferGeometry();
  readonly #material = new MeshBasicMaterial({ side: DoubleSide });
  readonly #object: ThreeMesh;
  readonly #ray = new Raycaster();
  readonly #ndc = new Vector2();
  readonly #hits: Intersection[] = [];
  readonly #a = new Vector3();
  readonly #b = new Vector3();
  readonly #c = new Vector3();
  readonly #weights = new Vector3();
  readonly #source: Float32Array;
  #field: ResultField;
  #deform = NaN;
  constructor(mesh: Mesh, field: ResultField) {
    this.#source = mesh.positions;
    this.#field = field;
    this.#geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(mesh.positions), 3),
    );
    this.#geometry.setIndex(new BufferAttribute(mesh.indices, 1));
    this.#object = new ThreeMesh(this.#geometry, this.#material);
  }
  update(field: ResultField) {
    this.#field = field;
    this.#deform = NaN;
  }
  sample(camera: Camera, x: number, y: number, deform: number): number | null {
    const positions = this.#geometry.getAttribute('position');
    if (this.#deform !== deform) {
      this.#deform = deform;
      const displacement = this.#field.displacement;
      for (let i = 0; i < positions.count; i++)
        positions.setXYZ(
          i,
          (this.#source[i * 3] ?? 0) + (displacement?.[i * 3] ?? 0) * deform,
          (this.#source[i * 3 + 1] ?? 0) + (displacement?.[i * 3 + 1] ?? 0) * deform,
          (this.#source[i * 3 + 2] ?? 0) + (displacement?.[i * 3 + 2] ?? 0) * deform,
        );
      this.#geometry.computeBoundingSphere();
    }
    this.#ndc.set(x, y);
    this.#ray.setFromCamera(this.#ndc, camera);
    this.#hits.length = 0;
    this.#ray.intersectObject(this.#object, false, this.#hits);
    for (const hit of this.#hits) {
      if (!hit.face) continue;
      const { a, b, c } = hit.face;
      this.#a.fromBufferAttribute(positions, a);
      this.#b.fromBufferAttribute(positions, b);
      this.#c.fromBufferAttribute(positions, c);
      Triangle.getBarycoord(hit.point, this.#a, this.#b, this.#c, this.#weights);
      const value =
        this.#weights.x * (this.#field.values[a] ?? 0) +
        this.#weights.y * (this.#field.values[b] ?? 0) +
        this.#weights.z * (this.#field.values[c] ?? 0);
      if (Number.isFinite(value) && value >= (this.#field.cutBelow ?? -Infinity)) return value;
    }
    return null;
  }
  dispose() {
    this.#geometry.dispose();
    this.#material.dispose();
  }
}
