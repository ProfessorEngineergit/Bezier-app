/**
 * Preview of a model being imported, shown while it meshes (up to half a minute for a large
 * assembly): its edges with a sweeping band of light and a box around its final bounds. The
 * outline is thinned first (`outline-budget.ts`); the sweep runs off a time uniform set in
 * `onBeforeRender`, so the render loop is unaware of it and nothing allocates per frame.
 */

import type { Bounds, EdgeSet, MeshPiece } from '@bezier/kernel';
import {
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  ShaderMaterial,
  Vector3,
} from 'three';
import { buildEdgeGeometry } from './edges.js';
import { thinEdges } from './outline-budget.js';

/** One sweep across the model, in milliseconds. */
const SWEEP_MS = 1600;

const vertexShader = /* glsl */ `
  uniform vec3 boxMin;
  uniform vec3 boxSize;
  varying float along;
  void main() {
    // Where this point sits along a diagonal through the box, from 0 to 1.
    vec3 unit = (position - boxMin) / max(boxSize, vec3(1e-6));
    along = dot(unit, vec3(0.55, 0.3, 0.15));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 colour;
  uniform float phase;
  varying float along;
  void main() {
    float band = exp(-pow((along - phase) / 0.11, 2.0));
    gl_FragColor = vec4(colour, 0.2 + 0.8 * band);
  }
`;

const corner = new Vector3();

export class ImportPreview {
  readonly object = new Group();
  readonly #colour = { value: new Color() };
  readonly #phase = { value: 0 };
  readonly #boxMin = { value: new Vector3() };
  readonly #boxSize = { value: new Vector3() };
  readonly #material = new ShaderMaterial({
    uniforms: {
      colour: this.#colour,
      phase: this.#phase,
      boxMin: this.#boxMin,
      boxSize: this.#boxSize,
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
  readonly #frame = new LineBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false });
  #edges: LineSegments | null = null;
  #box: LineSegments | null = null;
  #bounds: Bounds | null = null;
  /** Parts already meshed, shown while the rest are (kernel streaming). */
  readonly #pieces: Mesh[] = [];
  readonly #pieceMaterial = new MeshLambertMaterial({ color: 0xb4b4b8 });

  /** Whether the outline's sweep is running, and so needs every frame drawn. */
  get animating(): boolean {
    return this.#edges !== null;
  }

  /** The space the model will take, while it is on its way. */
  get box(): Bounds | null {
    return this.#bounds;
  }

  /**
   * Whether a point on screen (CSS pixels from the canvas's top left, on a canvas `width` by
   * `height`) falls inside the space the model will take, as seen through `camera`.
   */
  hits(camera: Camera, x: number, y: number, width: number, height: number): boolean {
    const box = this.#bounds;
    if (box === null) return false;
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 8; i++) {
      corner
        .set(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z,
        )
        .project(camera);
      const sx = ((corner.x + 1) / 2) * width;
      const sy = ((1 - corner.y) / 2) * height;
      [left, right, top, bottom] = [
        Math.min(left, sx),
        Math.max(right, sx),
        Math.min(top, sy),
        Math.max(bottom, sy),
      ];
    }
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  /** Show this outline in this colour (a CSS colour), replacing any before. */
  show(edges: EdgeSet, box: Bounds, colour: string): void {
    this.clear();
    this.#bounds = box;
    this.#colour.value.set(colour);
    this.#frame.color.set(colour);
    this.#boxMin.value.set(box.min.x, box.min.y, box.min.z);
    this.#boxSize.value.set(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);

    this.#edges = new LineSegments(buildEdgeGeometry(thinEdges(edges)), this.#material);
    // Runs once per frame while the outline is on screen, and only then.
    this.#edges.onBeforeRender = () => {
      this.#phase.value = -0.2 + ((performance.now() % SWEEP_MS) / SWEEP_MS) * 1.4;
    };
    this.#box = new LineSegments(boxGeometry(box), this.#frame);
    this.object.add(this.#edges, this.#box);
  }

  /** Another batch of meshed parts. Plain and unpickable: it is only a preview. */
  addPiece(piece: MeshPiece): void {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(piece.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(piece.normals, 3));
    geometry.setIndex(new BufferAttribute(piece.indices, 1));
    const mesh = new Mesh(geometry, this.#pieceMaterial);
    this.#pieces.push(mesh);
    this.object.add(mesh);
  }

  get hasPieces(): boolean {
    return this.#pieces.length > 0;
  }

  clear(): void {
    for (const mesh of this.#pieces) {
      this.object.remove(mesh);
      mesh.geometry.dispose();
    }
    this.#pieces.length = 0;
    for (const line of [this.#edges, this.#box]) {
      if (line === null) continue;
      this.object.remove(line);
      line.geometry.dispose();
    }
    this.#edges = null;
    this.#box = null;
    this.#bounds = null;
  }

  get shown(): boolean {
    return this.#edges !== null;
  }

  dispose(): void {
    this.clear();
    this.#material.dispose();
    this.#frame.dispose();
    this.#pieceMaterial.dispose();
  }
}

/** The twelve edges of a box, as line segments. */
function boxGeometry(box: Bounds): BufferGeometry {
  const { min, max } = box;
  const corner = (i: number) => [
    i & 1 ? max.x : min.x,
    i & 2 ? max.y : min.y,
    i & 4 ? max.z : min.z,
  ];
  const pairs = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  const positions = new Float32Array(pairs.flatMap((i) => corner(i)));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return geometry;
}
