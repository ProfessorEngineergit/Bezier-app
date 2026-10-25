/**
 * Draws a single rebuilt solid during a face pull (the studio's `session-pull.ts`) and hides the
 * old one by collapsing its triangles and edges in place. Its triangles are contiguous, so only
 * that range is re-uploaded (kilobytes instead of the model's tens of megabytes).
 *
 * Edges are not tied to faces, so the old solid's edges are those with both ends on corners of the
 * hidden triangles; the kernel draws face boundaries through the triangulation's points.
 */

import type { EdgeSet, Mesh } from '@bezier/kernel';
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineSegments,
  type Material,
  type Matrix4,
  Mesh as ThreeMesh,
} from 'three';
import { buildEdgeGeometry } from './edges.js';
import { BASE_COLOUR } from './highlight.js';
import { buildGeometry } from './mesh.js';

/** A part as the kernel triangulated it. */
export interface PartMesh {
  mesh: Mesh;
  edges: EdgeSet | null;
}

/** What the part stands in for: the model drawn now, and which of its faces. */
export interface Replaced {
  body: ThreeMesh;
  wireframe: LineSegments | null;
  mesh: Mesh;
  faces: readonly number[];
  /** Each face's own colour, linear, three a face (`linearColours`). */
  own: Float32Array | undefined;
}

/** A stretch of a buffer changed in place, and what it held before. */
interface Folded {
  attribute: BufferAttribute;
  from: number;
  saved: Uint32Array | Float32Array;
}

/** Corners closer than this are the same point, in millimetres. */
const SAME_POINT = 1e-3;

export class PartPreview {
  readonly group = new Group();
  readonly #surface: Material;
  readonly #lines: Material;
  #part: ThreeMesh | null = null;
  #edges: LineSegments | null = null;
  #folded: Folded[] = [];
  #replacing: { body: ThreeMesh; faces: string } | null = null;
  /** The part lifted out for a move (`showMoved`), and whether the original stays (a copy). */
  #lifted: { body: ThreeMesh; faces: string; copy: boolean } | null = null;
  /** What `#fold` found of the hidden part, for `showMoved` to draw again. */
  #found: { triangles: Uint32Array; corners: Uint32Array; segments: Float32Array } | null = null;

  constructor(surface: Material, lines: Material) {
    this.#surface = surface;
    this.#lines = lines;
  }

  /** Draw `part` in place of `replaced`'s faces; null puts the model back. */
  show(part: PartMesh | null, replaced: Replaced | null | undefined): void {
    const started = performance.now();
    this.#show(part, replaced);
    // Beside `bezier:upload`: what the main thread spends on one drag step.
    performance.measure('bezier:part-show', { start: started, end: performance.now() });
  }

  #show(part: PartMesh | null, replaced: Replaced | null | undefined): void {
    this.#dropPart();
    if (part === null || replaced === null || replaced === undefined) {
      this.#restore();
      return;
    }
    const faces = replaced.faces.join(',');
    if (this.#replacing?.body !== replaced.body || this.#replacing.faces !== faces) {
      this.#restore();
      this.#fold(replaced);
      this.#replacing = { body: replaced.body, faces };
    }
    // In the colour of the face pulled, which a part from a file has all over.
    const face = (replaced.faces[0] ?? 0) * 3;
    const own = replaced.own;
    const colour =
      own === undefined
        ? BASE_COLOUR
        : ([own[face] ?? 1, own[face + 1] ?? 1, own[face + 2] ?? 1] as const);
    this.#part = new ThreeMesh(buildGeometry(part.mesh, colour), this.#surface);
    this.group.add(this.#part);
    if (part.edges !== null) {
      this.#edges = new LineSegments(buildEdgeGeometry(part.edges), this.#lines);
      this.#edges.visible = replaced.wireframe?.visible ?? false;
      this.group.add(this.#edges);
    }
  }

  /**
   * Draws faces of the model moved by `matrix`, for dragging a body. Triangles and edges are copied
   * once per drag; each step then only updates the matrix. With `copy` the original stays. Null
   * puts the model back.
   */
  showMoved(replaced: Replaced | null, matrix: Matrix4 | null, copy = false): void {
    if (replaced === null || matrix === null) {
      this.clear();
      return;
    }
    const faces = replaced.faces.join(',');
    const lifted = this.#lifted;
    if (lifted?.body !== replaced.body || lifted.faces !== faces || lifted.copy !== copy) {
      this.#dropPart();
      this.#restore();
      this.#found = null;
      this.#fold(replaced, copy);
      this.#replacing = copy ? null : { body: replaced.body, faces };
      this.#lifted = { body: replaced.body, faces, copy };
      this.#build(replaced);
    }
    for (const object of [this.#part, this.#edges]) {
      if (object === null) continue;
      object.matrixAutoUpdate = false;
      object.matrix.copy(matrix);
      object.matrixWorldNeedsUpdate = true;
    }
  }

  /** The lifted triangles and edges as a part of their own, in the model's own coordinates. */
  #build(replaced: Replaced): void {
    const found = this.#found;
    if (found === null || found.triangles.length === 0) return;
    const { mesh, own } = replaced;
    const remap = new Map<number, number>();
    const positions: number[] = [];
    const normals: number[] = [];
    const colours: number[] = [];
    const indices = new Uint32Array(found.triangles.length * 3);
    found.triangles.forEach((t, i) => {
      const face = (mesh.triangleFaces[t] ?? 0) * 3;
      for (let k = 0; k < 3; k++) {
        const vertex = found.corners[i * 3 + k] ?? 0;
        let at = remap.get(vertex);
        if (at === undefined) {
          at = remap.size;
          remap.set(vertex, at);
          for (let c = 0; c < 3; c++) {
            positions.push(mesh.positions[vertex * 3 + c] ?? 0);
            normals.push(mesh.normals[vertex * 3 + c] ?? 0);
            colours.push(own === undefined ? (BASE_COLOUR[c] ?? 1) : (own[face + c] ?? 1));
          }
        }
        indices[i * 3 + k] = at;
      }
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(Float32Array.from(normals), 3));
    geometry.setAttribute('color', new BufferAttribute(Float32Array.from(colours), 3));
    geometry.setAttribute('faceBias', new BufferAttribute(new Float32Array(remap.size), 1));
    geometry.setIndex(new BufferAttribute(indices, 1));
    this.#part = new ThreeMesh(geometry, this.#surface);
    this.group.add(this.#part);
    if (found.segments.length > 0 && replaced.wireframe !== null) {
      const lines = new BufferGeometry();
      lines.setAttribute('position', new BufferAttribute(found.segments, 3));
      this.#edges = new LineSegments(lines, this.#lines);
      this.#edges.visible = replaced.wireframe.visible;
      this.group.add(this.#edges);
    }
  }

  /** Take the part down and put the model back as it was. */
  clear(): void {
    this.show(null, null);
  }

  dispose(): void {
    this.clear();
  }

  // Once per drag over the whole model (millions of triangles on large assemblies): flags and plain
  // numbers, since sets and small arrays cost 0.14 s here.
  #fold({ body, wireframe, mesh, faces }: Replaced, keep = false): void {
    const index = body.geometry.getIndex();
    if (index === null || faces.length === 0) return;
    const hidden = new Uint8Array(Math.max(...faces) + 1);
    for (const face of faces) hidden[face] = 1;
    const isHidden = (t: number) => hidden[mesh.triangleFaces[t] ?? hidden.length] === 1;
    const indices = index.array as Uint32Array;
    let first = -1;
    let last = -1;
    for (let t = 0; t < mesh.triangleFaces.length; t++) {
      if (!isHidden(t)) continue;
      if (first === -1) first = t;
      last = t;
    }
    if (first === -1) return;

    // The corners of the hidden triangles, for finding its edges below.
    const corners = new Set<number>();
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const positions = mesh.positions;
    const from = first * 3;
    const to = (last + 1) * 3;
    const saved = indices.slice(from, to);
    const taken: number[] = [];
    for (let t = first; t <= last; t++) {
      if (!isHidden(t)) continue;
      taken.push(t);
      for (let k = 0; k < 3; k++) {
        const vertex = indices[t * 3 + k] ?? 0;
        const x = positions[vertex * 3] ?? 0;
        const y = positions[vertex * 3 + 1] ?? 0;
        const z = positions[vertex * 3 + 2] ?? 0;
        corners.add(pointKey(x, y, z));
        grow(box, x, y, z);
      }
      // All three corners on one: a triangle with no area draws nothing.
      indices[t * 3 + 1] = indices[t * 3] ?? 0;
      indices[t * 3 + 2] = indices[t * 3] ?? 0;
    }
    // Their corners as they were before folding.
    const original = new Uint32Array(taken.length * 3);
    taken.forEach((t, i) => {
      original.set(saved.subarray(t * 3 - from, t * 3 - from + 3), i * 3);
    });
    this.#found = {
      triangles: Uint32Array.from(taken),
      corners: original,
      segments: new Float32Array(0),
    };
    if (keep) indices.set(saved, from);
    else this.#changed(index, from, to, saved);

    if (wireframe === null) return;
    const lines = wireframe.geometry.getAttribute('position') as BufferAttribute;
    const points = lines.array as Float32Array;
    const e = SAME_POINT;
    const [x0 = 0, y0 = 0, z0 = 0, x1 = 0, y1 = 0, z1 = 0] = box;
    const within = (at: number) => {
      const x = points[at] ?? 0;
      const y = points[at + 1] ?? 0;
      const z = points[at + 2] ?? 0;
      return x >= x0 - e && x <= x1 + e && y >= y0 - e && y <= y1 + e && z >= z0 - e && z <= z1 + e;
    };
    const corner = (at: number) =>
      corners.has(pointKey(points[at] ?? 0, points[at + 1] ?? 0, points[at + 2] ?? 0));
    let lo = -1;
    let hi = -1;
    const segments: number[] = [];
    for (let at = 0; at + 5 < points.length; at += 6) {
      if (!within(at) || !within(at + 3) || !corner(at) || !corner(at + 3)) continue;
      segments.push(at);
      if (lo === -1) lo = at;
      hi = at + 6;
    }
    if (lo === -1) return;
    const lifted = new Float32Array(segments.length * 6);
    segments.forEach((at, i) => {
      lifted.set(points.subarray(at, at + 6), i * 6);
    });
    if (this.#found !== null) this.#found.segments = lifted;
    if (keep) return;
    const before = points.slice(lo, hi);
    for (const at of segments) {
      points[at + 3] = points[at] ?? 0;
      points[at + 4] = points[at + 1] ?? 0;
      points[at + 5] = points[at + 2] ?? 0;
    }
    this.#changed(lines, lo, hi, before);
  }

  #changed(
    attribute: BufferAttribute,
    from: number,
    to: number,
    saved: Uint32Array | Float32Array,
  ): void {
    this.#folded.push({ attribute, from, saved });
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(from, to - from);
    attribute.needsUpdate = true;
  }

  #restore(): void {
    for (const { attribute, from, saved } of this.#folded) {
      (attribute.array as Uint32Array | Float32Array).set(saved, from);
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(from, saved.length);
      attribute.needsUpdate = true;
    }
    this.#folded = [];
    this.#replacing = null;
    this.#lifted = null;
  }

  #dropPart(): void {
    if (this.#part !== null) {
      this.group.remove(this.#part);
      (this.#part.geometry as BufferGeometry).dispose();
      this.#part = null;
    }
    if (this.#edges !== null) {
      this.group.remove(this.#edges);
      this.#edges.geometry.dispose();
      this.#edges = null;
    }
  }
}

/**
 * A point rounded to `SAME_POINT`, hashed to one number. Collisions can hide a stray neighbouring
 * edge during a drag; accepted to avoid a string key per segment.
 */
function pointKey(x: number, y: number, z: number): number {
  const i = Math.round(x / SAME_POINT);
  const j = Math.round(y / SAME_POINT);
  const k = Math.round(z / SAME_POINT);
  return (i * 73856093) ^ (j * 19349663) ^ (k * 83492791);
}

function grow(box: number[], x: number, y: number, z: number): void {
  box[0] = Math.min(box[0] ?? x, x);
  box[1] = Math.min(box[1] ?? y, y);
  box[2] = Math.min(box[2] ?? z, z);
  box[3] = Math.max(box[3] ?? x, x);
  box[4] = Math.max(box[4] ?? y, y);
  box[5] = Math.max(box[5] ?? z, z);
}
