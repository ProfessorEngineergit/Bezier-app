/**
 * Resolves a click to a `StableRef` (e.g. side 3 of `extrude-1`), never a triangle index, which is
 * meaningless after a rebuild.
 *
 * Edges come from seams between named CAD faces: nearby rays find candidate faces, then their
 * projected seams are tested against pixel tolerance and depth, which also finds silhouette rims
 * (a circle in Top). Corners win over an edge within a tighter radius.
 */

import { edgeRef, type FaceRef, type StableRef, vertexRef } from '@bezier/core';
import type { Mesh } from '@bezier/kernel';
import type { Vector3 } from 'three';
import { OrthographicCamera, Vector3 as Vec } from 'three';
import { Bvh, createRayHit } from './bvh.js';
import type { ActiveCamera } from './camera.js';
import { type Corner, CornerPicker } from './corner-picking.js';
import type { CornerTable } from './corner-table.js';
import { EdgePicker } from './edge-picking.js';
import { buildSeams, type SeamTable } from './seams.js';
import { awaySign, pastCut, type SectionCut } from './section-cut.js';

export type PickFilter = 'face' | 'edge' | 'vertex' | 'any';

export interface PickResult {
  ref: StableRef;
  /** World-space hit point, in millimetres. */
  point: { x: number; y: number; z: number };
  /** Distance from the camera, for choosing the nearest of several hits. */
  distance: number;
}

/** How many rays to cast around the cursor when looking for a seam. */
const RING_SAMPLES = 8;
/** A corner is picked within this share of the edge tolerance. */
const CORNER_SHARE = 0.7;

/** Hoisted so a hover allocates nothing. Reused by every call. */
const origin = new Vec();
const target = new Vec();
const projectedPoint = new Vec();
const ringFaces = new Int32Array(RING_SAMPLES + 1);

/** How far under the surface a wall-thickness ray starts, in millimetres. */
const WALL_START = 1e-3;

export class Picker {
  #bvh: Bvh | null = null;
  #triangleFaces: Uint32Array | null = null;
  #faceRefs: readonly (StableRef | null)[] = [];
  #edges: EdgePicker | null = null;
  #corners: CornerPicker | null = null;
  /** The camera of the pick in progress, for the corner test's visibility check. */
  #camera: ActiveCamera | null = null;
  readonly #seen = (x: number, y: number, z: number): boolean =>
    this.#camera !== null && this.pointVisible(this.#camera, x, y, z);
  readonly #hit = createRayHit();
  #section: SectionCut | null = null;

  /** The GPU and CPU must agree on which half of a section is visible. */
  setSection(cut: SectionCut | null): void {
    this.#section = cut;
  }

  /**
   * Sets new geometry. `faceRefs` is indexed by `Mesh.triangleFaces`; it may be empty before naming
   * has run, and picking then returns null.
   */
  setGeometry(
    mesh: Mesh | null,
    faceRefs: readonly (StableRef | null)[],
    tree: 'build' | 'later' = 'build',
    seams?: SeamTable | null,
  ): void {
    // `later`: the tree is being built on another thread (off-thread.ts) and arrives through
    // `adoptTree`; until then nothing is picked.
    this.#bvh = mesh === null || tree === 'later' ? null : new Bvh(mesh.positions, mesh.indices);
    this.#triangleFaces = mesh?.triangleFaces ?? null;
    this.#faceRefs = faceRefs;
    this.#edges = null;
    this.#corners = null;
    if (mesh !== null && tree === 'build') this.adoptSeams(seams ?? buildSeams(mesh));
  }

  /** `corners` when another thread built them from these seams (`geometry-worker.ts`). */
  adoptSeams(seams: SeamTable, corners?: CornerTable): void {
    this.#edges = new EdgePicker(seams, this.#faceRefs);
    this.#corners = new CornerPicker(corners ?? seams);
  }

  /** Where the corner these faces meet at is, for drawing a picked vertex. */
  cornerOf(faces: readonly number[]): Corner | null {
    return this.#corners?.cornerOf(faces) ?? null;
  }

  /** The tree for the geometry set with `later`. */
  adoptTree(bvh: Bvh): void {
    this.#bvh = bvh;
  }

  get ready(): boolean {
    return this.#bvh !== null;
  }

  /** Surface annotations obey the same depth and section rules as the solid. */
  pointVisible(camera: ActiveCamera, x: number, y: number, z: number): boolean {
    if (this.#section !== null && pastCut(this.#section, { x, y, z }) > 1e-6) return false;
    projectedPoint.set(x, y, z).project(camera);
    if (projectedPoint.z < -1 || projectedPoint.z > 1) return false;
    rayThrough(camera, projectedPoint.x, projectedPoint.y, origin, target);
    const distance =
      (x - origin.x) * target.x + (y - origin.y) * target.y + (z - origin.z) * target.z;
    const face = this.faceAt(camera, projectedPoint.x, projectedPoint.y);
    return face < 0 || this.#hit.distance >= distance - Math.max(1e-5, distance * 1e-6);
  }

  /** The face index under an NDC point, or -1. Highlighting needs the index, not the reference. */
  faceAt(camera: ActiveCamera, ndcX: number, ndcY: number): number {
    const bvh = this.#bvh;
    const faces = this.#triangleFaces;
    if (bvh === null || faces === null) return -1;

    rayThrough(camera, ndcX, ndcY, origin, target);
    let skipped = 0;
    const cut = this.#section;
    if (cut !== null && pastCut(cut, origin) > 0) {
      const toward = target[cut.axis];
      if (awaySign(cut) * toward >= 0) return -1;
      skipped = (cut.at - origin[cut.axis]) / toward;
      origin.addScaledVector(target, skipped);
    }
    if (!bvh.raycast(origin.x, origin.y, origin.z, target.x, target.y, target.z, this.#hit)) {
      return -1;
    }
    if (cut !== null && pastCut(cut, this.#hit) > 1e-7) return -1;
    this.#hit.distance += skipped;
    return faces[this.#hit.triangle] ?? -1;
  }

  /**
   * Every face along the ray through an NDC point, nearest first, each once, for "select through"
   * (audit F-060). Runs on right-click, not on the hover path.
   */
  facesAlong(camera: ActiveCamera, ndcX: number, ndcY: number, limit = 64): StableRef[] {
    const bvh = this.#bvh;
    const faces = this.#triangleFaces;
    if (bvh === null || faces === null) return [];
    rayThrough(camera, ndcX, ndcY, origin, target);
    const found: StableRef[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < limit; i++) {
      if (!bvh.raycast(origin.x, origin.y, origin.z, target.x, target.y, target.z, this.#hit))
        break;
      const face = faces[this.#hit.triangle] ?? -1;
      const ref = this.#faceRefs[face];
      if (!seen.has(face) && ref !== undefined && ref !== null) {
        seen.add(face);
        found.push(ref);
      }
      // On past the surface just met, by a step that scales with how far it was.
      origin.addScaledVector(
        target,
        this.#hit.distance + Math.max(1e-6, this.#hit.distance * 1e-6),
      );
    }
    return found;
  }

  /**
   * How thick the part is at each vertex, in millimetres. Measured from the middle of each triangle:
   * a ray from a vertex runs along the edges of whatever it meets and slips between triangles. A
   * vertex takes the thinnest of the triangles around it.
   */
  wallThickness(mesh: {
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
  }): Float32Array | null {
    const bvh = this.#bvh;
    if (bvh === null) return null;
    const { positions, normals, indices } = mesh;
    const walls = new Float32Array(positions.length / 3).fill(Number.POSITIVE_INFINITY);
    const hit = createRayHit();
    const average = (from: Float32Array, a: number, b: number, c: number, axis: number) =>
      ((from[a * 3 + axis] ?? 0) + (from[b * 3 + axis] ?? 0) + (from[c * 3 + axis] ?? 0)) / 3;
    for (let corner = 0; corner + 2 < indices.length; corner += 3) {
      const [a, b, c] = [indices[corner] ?? 0, indices[corner + 1] ?? 0, indices[corner + 2] ?? 0];
      const [nx, ny, nz] = [0, 1, 2].map((axis) => average(normals, a, b, c, axis)) as [
        number,
        number,
        number,
      ];
      const length = Math.hypot(nx, ny, nz);
      if (length < 1e-9) continue;
      const [x, y, z] = [nx / length, ny / length, nz / length];
      // Just under the surface, so the ray does not meet the triangle it starts on.
      const met = bvh.raycast(
        average(positions, a, b, c, 0) - x * WALL_START,
        average(positions, a, b, c, 1) - y * WALL_START,
        average(positions, a, b, c, 2) - z * WALL_START,
        -x,
        -y,
        -z,
        hit,
      );
      if (!met) continue;
      const wall = hit.distance + WALL_START;
      for (const vertex of [a, b, c]) {
        if (wall < (walls[vertex] ?? 0)) walls[vertex] = wall;
      }
    }
    return walls;
  }

  /**
   * What is under the cursor, as a stable reference. `ndcRadius` is the sampling ring's radius in
   * NDC; the caller converts from pixels since it knows the canvas size.
   */
  pick(
    camera: ActiveCamera,
    ndcX: number,
    ndcY: number,
    ndcRadius: number,
    filter: PickFilter = 'any',
    radiusY = ndcRadius,
  ): PickResult | null {
    const centre = this.faceAt(camera, ndcX, ndcY);

    // Read the hit before any further raycast overwrites the shared record.
    const point = { x: this.#hit.x, y: this.#hit.y, z: this.#hit.z };
    const distance = this.#hit.distance;

    const centreRef = this.#faceRefs[centre] ?? null;

    if (filter !== 'face') {
      ringFaces[0] = centre;
      let count = 1;
      for (let i = 0; i < RING_SAMPLES; i++) {
        const angle = (i / RING_SAMPLES) * Math.PI * 2;
        const face = this.faceAt(
          camera,
          ndcX + Math.cos(angle) * ndcRadius,
          ndcY + Math.sin(angle) * radiusY,
        );
        if (face < 0) continue;
        let seen = false;
        for (let j = 0; j < count; j++) if (ringFaces[j] === face) seen = true;
        if (!seen) ringFaces[count++] = face;
      }
      if (ndcRadius > 0 && radiusY > 0 && this.#corners !== null) {
        this.#camera = camera;
        const corner = this.#corners.near(
          camera,
          ndcX,
          ndcY,
          ndcRadius * CORNER_SHARE,
          radiusY * CORNER_SHARE,
          ringFaces,
          count,
          this.#seen,
        );
        this.#camera = null;
        const faces = corner === null ? null : namedOnce(corner.faces, this.#faceRefs);
        if (corner !== null && faces !== null) {
          camera.getWorldPosition(projectedPoint);
          return {
            ref: vertexRef(faces),
            point: { x: corner.x, y: corner.y, z: corner.z },
            distance: Math.hypot(
              corner.x - projectedPoint.x,
              corner.y - projectedPoint.y,
              corner.z - projectedPoint.z,
            ),
          };
        }
      }
      if (filter === 'vertex') return null;
      if (
        ndcRadius > 0 &&
        radiusY > 0 &&
        this.#edges?.near(camera, ndcX, ndcY, ndcRadius, radiusY, ringFaces, count, this)
      ) {
        const hit = this.#edges.hit;
        const a = asFace(this.#faceRefs[hit.first] ?? null);
        const b = asFace(this.#faceRefs[hit.second] ?? null);
        if (a !== null && b !== null) {
          camera.getWorldPosition(projectedPoint);
          return {
            ref: edgeRef(a, b),
            point: { x: hit.x, y: hit.y, z: hit.z },
            distance: Math.hypot(
              hit.x - projectedPoint.x,
              hit.y - projectedPoint.y,
              hit.z - projectedPoint.z,
            ),
          };
        }
      }
      // Asked for an edge specifically and the cursor is not on one.
      if (filter === 'edge') return null;
    }

    return centre < 0 || centreRef === null ? null : { ref: centreRef, point, distance };
  }
}

/**
 * The named faces at a corner, each once (a split face is several pieces under one name), or null
 * when fewer than three names meet there or one piece has no name.
 */
function namedOnce(
  indices: readonly number[],
  refs: readonly (StableRef | null)[],
): FaceRef[] | null {
  const byName = new Map<string, FaceRef>();
  for (const index of indices) {
    const face = asFace(refs[index] ?? null);
    if (face === null) return null;
    byName.set(`${face.feature}:${face.tag}`, face);
  }
  return byName.size >= 3 ? [...byName.values()] : null;
}

/** An edge is named by two *faces*, so anything else cannot contribute to one. */
function asFace(ref: StableRef | null): FaceRef | null {
  return ref !== null && ref.kind === 'face' ? ref : null;
}

/**
 * The ray through an NDC point, with a normalised direction so `RayHit.distance` is in millimetres.
 * Perspective rays share an origin; orthographic rays share a direction and start on the near
 * plane under the cursor.
 */
function rayThrough(
  camera: ActiveCamera,
  ndcX: number,
  ndcY: number,
  from: Vector3,
  direction: Vector3,
): void {
  if (camera instanceof OrthographicCamera) {
    // Start on the near plane under the cursor and travel straight ahead.
    from.set(ndcX, ndcY, -1).unproject(camera);
    direction.set(0, 0, -1).transformDirection(camera.matrixWorld);
    return;
  }
  camera.getWorldPosition(from);
  direction.set(ndcX, ndcY, 0.5).unproject(camera).sub(from).normalize();
}
