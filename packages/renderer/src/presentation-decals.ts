/**
 * The pictures stuck onto the model in Visualize, kept as where they were placed and not only as
 * meshes: a renderer started afresh after its device was lost puts them back where they were,
 * whatever the camera has done since (`use-presentation-recovery.ts`).
 */

import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import {
  Euler,
  Mesh,
  MeshPhysicalMaterial,
  type Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three/webgpu';

/** One decal, in world terms: the picture, the body it sits on, where and turned how. */
export interface DecalPlacement {
  file: File;
  body: string;
  point: readonly [number, number, number];
  orientation: readonly [number, number, number];
  size: number;
}

export class PresentationDecals {
  readonly #scene: Scene;
  readonly #changed: () => void;
  #shown: { mesh: Mesh<DecalGeometry, MeshPhysicalMaterial>; placement: DecalPlacement }[] = [];

  constructor(scene: Scene, changed: () => void) {
    this.#scene = scene;
    this.#changed = changed;
  }

  get count(): number {
    return this.#shown.length;
  }

  get placements(): readonly DecalPlacement[] {
    return this.#shown.map((shown) => shown.placement);
  }

  /** Put a decal on `body`; nothing when `current` says the body went while the picture loaded. */
  async place(placement: DecalPlacement, body: Mesh, current: () => boolean): Promise<void> {
    const url = URL.createObjectURL(placement.file);
    try {
      const texture = await new TextureLoader().loadAsync(url);
      if (!current()) {
        texture.dispose();
        return;
      }
      texture.colorSpace = SRGBColorSpace;
      const material = new MeshPhysicalMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        roughness: 0.45,
      });
      const { point, orientation, size } = placement;
      const mesh = new Mesh(
        new DecalGeometry(
          body,
          new Vector3(...point),
          new Euler(...orientation),
          new Vector3(size, size, size * 0.5),
        ),
        material,
      );
      this.#shown.push({ mesh, placement });
      this.#scene.add(mesh);
      this.#changed();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  clear(): void {
    for (const { mesh } of this.#shown) {
      this.#scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
    }
    this.#shown = [];
    this.#changed();
  }
}
