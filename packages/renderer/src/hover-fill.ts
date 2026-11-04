/**
 * The hovered face where something stands in front of it: a tint over whatever hides it, so the
 * face reads whole. Only the hidden part is drawn; the rest is already lit by its vertex colours
 * (`highlight.ts`) and must not change.
 */

import type { Mesh as KernelMesh } from '@bezier/kernel';
import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  GreaterDepth,
  Mesh,
  MeshBasicMaterial,
} from 'three';

/** Strong enough to read over a dark part, light enough to keep that part readable. */
const TINT = 0.34;

/** Triangles per face, as one flat array plus offsets, like `FaceVertices` in `mesh.ts`. */
export interface FaceTriangles {
  triangles: Uint32Array;
  offsets: Uint32Array;
}

export function indexFaceTriangles(triangleFaces: Uint32Array): FaceTriangles {
  let faceCount = 0;
  for (const face of triangleFaces) if (face + 1 > faceCount) faceCount = face + 1;
  const offsets = new Uint32Array(faceCount + 1);
  for (const face of triangleFaces) offsets[face + 1] = (offsets[face + 1] ?? 0) + 1;
  for (let face = 0; face < faceCount; face++)
    offsets[face + 1] = (offsets[face + 1] ?? 0) + (offsets[face] ?? 0);
  const next = offsets.slice();
  const triangles = new Uint32Array(triangleFaces.length);
  triangleFaces.forEach((face, triangle) => {
    const at = next[face] ?? 0;
    triangles[at] = triangle;
    next[face] = at + 1;
  });
  return { triangles, offsets };
}

export class HoverFill {
  readonly object: Mesh<BufferGeometry, MeshBasicMaterial>;
  #mesh: KernelMesh | null = null;
  /** Built at the first hover: most builds of a model are never hovered. */
  #index: FaceTriangles | null = null;
  /** One buffer the size of the model: a new one per face would pile up on the graphics card. */
  #corners: BufferAttribute | null = null;

  constructor(colour: number) {
    const material = new MeshBasicMaterial({
      color: colour,
      opacity: TINT,
      transparent: true,
      depthWrite: false,
      depthFunc: GreaterDepth,
      // Nearer than the surface it copies, which the body material pushes back, so a face never
      // counts as hidden behind itself.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -32,
    });
    this.object = new Mesh(new BufferGeometry(), material);
    // After the surfaces, before the outline.
    this.object.renderOrder = 2;
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  setColour(hex: number): void {
    this.object.material.color.setHex(hex);
  }

  /** The surface to copy. Goes to the graphics card only once something is hovered. */
  setGeometry(mesh: KernelMesh | null): void {
    this.show([]);
    this.#mesh = mesh;
    this.#index = null;
    this.#corners = null;
    this.object.geometry.dispose();
    this.object.geometry = new BufferGeometry();
    if (mesh !== null)
      this.object.geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  }

  /** Tints the hidden part of these faces; empty clears it. */
  show(faces: readonly number[]): void {
    const mesh = this.#mesh;
    if (mesh === null || faces.length === 0) {
      this.object.visible = false;
      return;
    }
    this.#index ??= indexFaceTriangles(mesh.triangleFaces);
    const { triangles, offsets } = this.#index;
    if (this.#corners === null) {
      this.#corners = new BufferAttribute(new Uint32Array(mesh.indices.length), 1);
      this.#corners.setUsage(DynamicDrawUsage);
      this.object.geometry.setIndex(this.#corners);
    }
    const corners = this.#corners;
    const list = corners.array as Uint32Array;
    let at = 0;
    for (const face of faces) {
      for (let i = offsets[face] ?? 0; i < (offsets[face + 1] ?? 0); i++) {
        const triangle = (triangles[i] ?? 0) * 3;
        list[at++] = mesh.indices[triangle] ?? 0;
        list[at++] = mesh.indices[triangle + 1] ?? 0;
        list[at++] = mesh.indices[triangle + 2] ?? 0;
      }
    }
    corners.clearUpdateRanges();
    corners.addUpdateRange(0, at);
    corners.needsUpdate = true;
    this.object.geometry.setDrawRange(0, at);
    this.object.visible = at > 0;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}
