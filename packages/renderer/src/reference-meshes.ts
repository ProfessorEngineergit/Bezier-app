/**
 * Imported reference meshes: grey, translucent and never picked, so clicks go through to the model.
 * Kept by id so a rebuild that returns the same meshes reuses their buffers.
 */

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';

export interface ReferenceMesh {
  id: string;
  /** Nine floats per triangle, millimetres. */
  positions: Float32Array;
}

export class ReferenceMeshes {
  readonly group = new Group();
  readonly #material = new MeshStandardMaterial({
    color: 0x9aa3b2,
    transparent: true,
    opacity: 0.45,
    roughness: 0.8,
    side: DoubleSide,
    // Drawn after the solid and without writing depth, so the part inside a scan still shows
    // through it.
    depthWrite: false,
  });
  readonly #shown = new Map<string, { positions: Float32Array; mesh: Mesh }>();

  constructor() {
    this.group.name = 'reference-meshes';
  }

  set(meshes: readonly ReferenceMesh[]): void {
    const wanted = new Set(meshes.map((mesh) => mesh.id));
    for (const [id, shown] of this.#shown) {
      if (wanted.has(id)) continue;
      this.group.remove(shown.mesh);
      shown.mesh.geometry.dispose();
      this.#shown.delete(id);
    }
    for (const { id, positions } of meshes) {
      const existing = this.#shown.get(id);
      if (existing?.positions === positions) continue;
      if (existing !== undefined) {
        this.group.remove(existing.mesh);
        existing.mesh.geometry.dispose();
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, this.#material);
      mesh.renderOrder = 1;
      mesh.name = id;
      this.group.add(mesh);
      this.#shown.set(id, { positions, mesh });
    }
  }

  dispose(): void {
    this.set([]);
    this.#material.dispose();
  }
}
