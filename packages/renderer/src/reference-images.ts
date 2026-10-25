/**
 * Reference images on a plane: textured quads that are never picked with the model (the page has
 * its own handles). Kept by id; a move, resize or crop changes only the matrix and UVs, never
 * re-uploads the texture.
 */

import type { PlaneBasis } from '@bezier/core';
import {
  BufferAttribute,
  BufferGeometry,
  type Camera,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Ray,
  Raycaster,
  type Scene,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
} from 'three';

export interface ReferenceImage {
  id: string;
  /** The decoded picture. A new object means a new picture. */
  source: ImageBitmap;
  /** The plane the picture stands on, with the offset along its normal already applied. */
  basis: PlaneBasis;
  placement: ReferenceImagePlacement;
  opacity: number;
}

/** Where on the plane, in the plane's own millimetres, and how much of the picture is shown. */
export interface ReferenceImagePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Radians, anticlockwise on the plane. */
  rotation: number;
  /** The part of the whole picture taken off each side, 0 to 1. */
  crop: { left: number; top: number; right: number; bottom: number };
}

interface Shown {
  source: ImageBitmap;
  texture: Texture;
  material: MeshBasicMaterial;
  mesh: Mesh;
  basis: PlaneBasis;
}

const SCRATCH = new Matrix4();
const INVERSE = new Matrix4();
const LOCAL = new Ray();
const POINT = new Vector3();

export class ReferenceImages {
  readonly group = new Group();
  readonly #shown = new Map<string, Shown>();

  constructor() {
    this.group.name = 'reference-images';
  }

  /** The document's pictures, as they stand. Drops any preview. */
  set(images: readonly ReferenceImage[]): void {
    const wanted = new Set(images.map((image) => image.id));
    for (const [id, shown] of this.#shown) {
      if (wanted.has(id)) continue;
      this.#remove(id, shown);
    }
    for (const image of images) {
      let shown = this.#shown.get(image.id);
      if (shown !== undefined && shown.source !== image.source) {
        this.#remove(image.id, shown);
        shown = undefined;
      }
      if (shown === undefined) shown = this.#add(image);
      shown.basis = image.basis;
      shown.material.opacity = image.opacity;
      this.#place(shown, image.basis, image.placement);
    }
  }

  /** Shows a picture at a preview placement while a handle is dragged, until the next `set`. */
  preview(
    id: string,
    placement: ReferenceImagePlacement | null,
    opacity?: number,
    basis?: PlaneBasis,
  ): void {
    const shown = this.#shown.get(id);
    if (shown === undefined || placement === null) return;
    if (opacity !== undefined) shown.material.opacity = opacity;
    this.#place(shown, basis ?? shown.basis, placement);
  }

  /** The nearest picture under a ray, or null. */
  hit(ray: Ray): string | null {
    let nearest: string | null = null;
    let distance = Infinity;
    for (const [id, shown] of this.#shown) {
      if (!shown.mesh.visible) continue;
      // The ray in the picture's own frame, where the picture is the unit square on its z = 0.
      INVERSE.copy(shown.mesh.matrix).invert();
      LOCAL.copy(ray).applyMatrix4(INVERSE);
      const along = LOCAL.direction.z;
      if (Math.abs(along) < 1e-9) continue;
      const t = -LOCAL.origin.z / along;
      if (t <= 0) continue;
      POINT.set(LOCAL.origin.x + LOCAL.direction.x * t, LOCAL.origin.y + LOCAL.direction.y * t, 0);
      if (Math.abs(POINT.x) > 0.5 || Math.abs(POINT.y) > 0.5) continue;
      // Back to world distance; the picture's units are its size in millimetres.
      const far = POINT.applyMatrix4(shown.mesh.matrix).distanceTo(ray.origin);
      if (far >= distance) continue;
      nearest = id;
      distance = far;
    }
    return nearest;
  }

  #add(image: ReferenceImage): Shown {
    const texture = new Texture(image.source);
    // An ImageBitmap cannot be flipped on upload, so the quad's coordinates read the picture the
    // other way up instead (see `#place`).
    texture.flipY = false;
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: image.opacity,
      side: DoubleSide,
      // Behind what is drawn on the plane (sketch lines) without hiding what is behind it.
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
      // The picture's own colours, not the scene's grading of them.
      toneMapped: false,
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]),
        3,
      ),
    );
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(8), 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new Mesh(geometry, material);
    mesh.name = image.id;
    mesh.renderOrder = -1;
    // Never picked, and not measured for the model's bounds.
    mesh.raycast = () => undefined;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    const shown: Shown = { source: image.source, texture, material, mesh, basis: image.basis };
    this.#shown.set(image.id, shown);
    return shown;
  }

  #place(shown: Shown, basis: PlaneBasis, placement: ReferenceImagePlacement): void {
    const { x, y, width, height, rotation, crop } = placement;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    // The picture's own right and up on the plane, then in the world.
    const right = {
      x: basis.xDirection.x * cos + basis.yDirection.x * sin,
      y: basis.xDirection.y * cos + basis.yDirection.y * sin,
      z: basis.xDirection.z * cos + basis.yDirection.z * sin,
    };
    const up = {
      x: -basis.xDirection.x * sin + basis.yDirection.x * cos,
      y: -basis.xDirection.y * sin + basis.yDirection.y * cos,
      z: -basis.xDirection.z * sin + basis.yDirection.z * cos,
    };
    const n = basis.normal;
    const px = basis.origin.x + basis.xDirection.x * x + basis.yDirection.x * y;
    const py = basis.origin.y + basis.xDirection.y * x + basis.yDirection.y * y;
    const pz = basis.origin.z + basis.xDirection.z * x + basis.yDirection.z * y;
    // Columns: the picture's right across its width, its up across its height, the plane's normal
    // and where its middle is. The quad is one unit square about the origin.
    const matrix = SCRATCH.set(
      right.x * width,
      up.x * height,
      n.x,
      px,
      right.y * width,
      up.y * height,
      n.y,
      py,
      right.z * width,
      up.z * height,
      n.z,
      pz,
      0,
      0,
      0,
      1,
    );
    shown.mesh.matrix.copy(matrix);
    shown.mesh.matrixWorldNeedsUpdate = true;

    // v = 0 is the top row of the picture (the texture is not flipped on upload).
    const uv = shown.mesh.geometry.getAttribute('uv') as BufferAttribute;
    const u0 = crop.left;
    const u1 = 1 - crop.right;
    const v0 = crop.top;
    const v1 = 1 - crop.bottom;
    uv.array.set([u0, v1, u1, v1, u1, v0, u0, v0]);
    uv.needsUpdate = true;
  }

  #remove(id: string, shown: Shown): void {
    this.group.remove(shown.mesh);
    shown.mesh.geometry.dispose();
    shown.material.dispose();
    shown.texture.dispose();
    this.#shown.delete(id);
  }

  dispose(): void {
    this.set([]);
  }
}

/** The viewport's reference image layer and its API, kept out of `viewport.ts`. */
export class ImageLayer {
  readonly #images = new ReferenceImages();
  readonly #host: { scene: Scene; camera: Camera; invalidate(): void };
  readonly #size: () => { width: number; height: number };
  readonly #ray = new Raycaster();
  readonly #pointer = new Vector2();

  constructor(
    host: { scene: Scene; camera: Camera; invalidate(): void },
    size: () => { width: number; height: number },
  ) {
    this.#host = host;
    this.#size = size;
    host.scene.add(this.#images.group);
  }

  /** The document's pictures, as they stand. */
  set(images: readonly ReferenceImage[]): void {
    this.#images.set(images);
    this.#host.invalidate();
  }

  /** A picture shown somewhere else while a handle is dragged; the next `set` ends it. */
  preview(
    id: string,
    placement: ReferenceImagePlacement | null,
    opacity?: number,
    basis?: PlaneBasis,
  ): void {
    this.#images.preview(id, placement, opacity, basis);
    this.#host.invalidate();
  }

  /** The picture under a canvas pixel, or null. */
  pick(screenX: number, screenY: number): string | null {
    const { width, height } = this.#size();
    this.#ray.setFromCamera(
      this.#pointer.set((screenX / width) * 2 - 1, -(screenY / height) * 2 + 1),
      this.#host.camera,
    );
    return this.#images.hit(this.#ray.ray);
  }

  dispose(): void {
    this.#host.scene.remove(this.#images.group);
    this.#images.dispose();
  }
}
