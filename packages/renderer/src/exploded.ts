/**
 * An exploded view: each body drawn on its own, moved out from the middle of the model, and with
 * its own edges. The model is one mesh, so each body here is a window onto it: its own triangles
 * over the same buffers. Nothing about the model changes, and the rest of the viewport is left alone.
 */

import type { Mesh as KernelMesh } from '@bezier/kernel';
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineSegments,
  type Material,
  Mesh,
  type Mesh as ThreeMesh,
  Vector3,
} from 'three';
import { indexFaceTriangles } from './hover-fill.js';
import { pointKey } from './part-preview.js';

const ATTRIBUTES = ['position', 'normal', 'color', 'faceBias'];

/** The box around some vertices. */
function boxOf(positions: Float32Array, indices: Uint32Array): Box3 {
  const box = new Box3();
  const point = new Vector3();
  for (const index of indices) box.expandByPoint(point.fromArray(positions, index * 3));
  return box;
}

/** The body's own drawing, as the viewport holds it. Its materials are lists while parts are drawn. */
export interface ExplodeSource {
  body: ThreeMesh;
  surface: Material;
  wireframe: LineSegments | null;
  lines: Material;
  mesh: KernelMesh;
}

/** Which way each body goes: out from the model's middle, or up when it sits on it. */
export function directions(middles: readonly Vector3[]): Vector3[] {
  const centre = new Vector3();
  for (const middle of middles) centre.add(middle);
  centre.divideScalar(Math.max(1, middles.length));
  const reach = Math.max(...middles.map((middle) => middle.distanceTo(centre)), 1);
  return middles.map((middle, index) => {
    const out = middle.clone().sub(centre);
    if (out.length() > reach * 1e-3) return out;
    return new Vector3(0, 0, (index - (middles.length - 1) / 2) * reach);
  });
}

export class Exploded {
  readonly group = new Group();
  #built: { key: string; parts: { objects: (Mesh | LineSegments)[]; way: Vector3 }[] } | null =
    null;

  get showing(): boolean {
    return this.#built !== null;
  }

  /**
   * Draws the bodies `amount` apart, or nothing at 0: at 1 the outermost has gone the size of the
   * model, however close their middles are. Answers whether it is drawing them.
   */
  show(source: ExplodeSource, bodies: readonly (readonly number[])[], amount: number): boolean {
    if (amount <= 0 || bodies.length < 2) {
      this.clear();
      return false;
    }
    const key = bodies.map((faces) => faces.join()).join('|');
    if (this.#built?.key !== key) this.#build(source, bodies, key);
    for (const { objects, way } of this.#built?.parts ?? []) {
      for (const object of objects) object.position.copy(way).multiplyScalar(amount);
    }
    return true;
  }

  #build(
    { body, surface, wireframe, lines, mesh }: ExplodeSource,
    bodies: readonly (readonly number[])[],
    key: string,
  ): void {
    this.clear();
    const { triangles, offsets } = indexFaceTriangles(mesh.triangleFaces);
    const lists = bodies.map((faces) => {
      const corners: number[] = [];
      for (const face of faces) {
        for (let i = offsets[face] ?? 0; i < (offsets[face + 1] ?? 0); i++) {
          const triangle = (triangles[i] ?? 0) * 3;
          corners.push(
            mesh.indices[triangle] ?? 0,
            mesh.indices[triangle + 1] ?? 0,
            mesh.indices[triangle + 2] ?? 0,
          );
        }
      }
      return Uint32Array.from(corners);
    });
    const boxes = lists.map((list) => boxOf(mesh.positions, list));
    const ways = directions(boxes.map((box) => box.getCenter(new Vector3())));
    const whole = boxes.reduce((all, box) => all.union(box), new Box3());
    const furthest = Math.max(...ways.map((way) => way.length()), 1e-6);
    const reach = whole.getSize(new Vector3()).length() / furthest;
    const parts = lists.map((list, index) => {
      const geometry = new BufferGeometry();
      for (const name of ATTRIBUTES) {
        const shared = body.geometry.getAttribute(name);
        if (shared !== undefined) geometry.setAttribute(name, shared);
      }
      geometry.setIndex(new BufferAttribute(list, 1));
      const objects: (Mesh | LineSegments)[] = [new Mesh(geometry, surface)];
      const edges = wireframe === null ? null : edgesOf(wireframe, mesh.positions, list);
      if (edges !== null) objects.push(new LineSegments(edges, lines));
      for (const object of objects) {
        object.frustumCulled = false;
        this.group.add(object);
      }
      return { objects, way: (ways[index] ?? new Vector3()).multiplyScalar(reach) };
    });
    this.#built = { key, parts };
  }

  clear(): void {
    for (const { objects } of this.#built?.parts ?? []) {
      for (const object of objects) {
        this.group.remove(object);
        if (object instanceof LineSegments) object.geometry.dispose();
      }
    }
    this.#built = null;
  }
}

/** The model's edges that run between this body's corners, or null if it has none. */
function edgesOf(
  wireframe: LineSegments,
  positions: Float32Array,
  corners: Uint32Array,
): BufferGeometry | null {
  const own = new Set<number>();
  for (const index of corners) {
    own.add(
      pointKey(
        positions[index * 3] ?? 0,
        positions[index * 3 + 1] ?? 0,
        positions[index * 3 + 2] ?? 0,
      ),
    );
  }
  const points = (wireframe.geometry.getAttribute('position') as BufferAttribute)
    .array as Float32Array;
  const kept: number[] = [];
  const on = (at: number) =>
    own.has(pointKey(points[at] ?? 0, points[at + 1] ?? 0, points[at + 2] ?? 0));
  for (let at = 0; at + 5 < points.length; at += 6) {
    if (on(at) && on(at + 3)) for (let i = 0; i < 6; i++) kept.push(points[at + i] ?? 0);
  }
  if (kept.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from(kept), 3));
  return geometry;
}
