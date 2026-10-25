/**
 * A bounding-volume hierarchy over the display mesh for CPU picking. ADR 0007 rejects GPU id
 * buffers: `readPixels` stalls the pipeline and on some drivers exceeds the 8 ms hover budget.
 *
 * Flat typed arrays and index arithmetic, one of the hot paths ADR 0007 allows to be written this
 * way, so hovering allocates nothing. The `?? 0` on typed-array reads only satisfies
 * `noUncheckedIndexedAccess`; the indices are always in range.
 */

/** Below this, splitting costs more than testing the triangles directly. */
const LEAF_SIZE = 8;

/** Guards the parallel-ray case in the triangle test. */
const EPSILON = 1e-10;

/** Depth is logarithmic, so this is far more than a real mesh can reach. */
const MAX_STACK = 64;

/** Where a ray met the mesh. Filled in place by `raycast`; the caller owns and reuses it. */
export interface RayHit {
  /** Index of the triangle that was hit: an index into `Mesh.triangleFaces`. */
  triangle: number;
  /** Distance along the ray. */
  distance: number;
  x: number;
  y: number;
  z: number;
}

export function createRayHit(): RayHit {
  return { triangle: -1, distance: Number.POSITIVE_INFINITY, x: 0, y: 0, z: 0 };
}

/** Scratch for the traversal stack. Module-level so a raycast allocates nothing. */
const stack = new Int32Array(MAX_STACK);

/** A built tree, as the arrays it is made of. */
export interface BvhParts {
  order: Uint32Array;
  bounds: Float32Array;
  meta: Int32Array;
  nodeCount: number;
}

export class Bvh {
  readonly #positions: Float32Array;
  readonly #indices: Uint32Array;

  /** Triangle indices, permuted so each node owns a contiguous run. */
  readonly #order: Uint32Array;

  /** Six floats per node: min xyz then max xyz. */
  readonly #bounds: Float32Array;

  /**
   * Three ints per node: `[start|left, count, right]`. A leaf has `count > 0` and `start` indexes
   * `#order`; an inner node holds both children, which a depth-first build does not keep adjacent.
   */
  readonly #meta: Int32Array;

  #nodeCount = 0;

  /** Builds the tree, or adopts `parts` built over the same buffers (`geometry-worker.ts`). */
  constructor(positions: Float32Array, indices: Uint32Array, parts?: BvhParts) {
    this.#positions = positions;
    this.#indices = indices;
    if (parts !== undefined) {
      this.#order = parts.order;
      this.#bounds = parts.bounds;
      this.#meta = parts.meta;
      this.#nodeCount = parts.nodeCount;
      return;
    }

    const triangles = Math.floor(indices.length / 3);
    this.#order = new Uint32Array(triangles);
    for (let i = 0; i < triangles; i++) this.#order[i] = i;

    // A binary tree over L leaves has 2L-1 nodes, with at most one leaf per triangle; allocate
    // that bound once.
    const maxNodes = Math.max(1, 2 * triangles);
    this.#bounds = new Float32Array(maxNodes * 6);
    this.#meta = new Int32Array(maxNodes * 3);

    if (triangles > 0) this.#build(0, triangles, centroidsOf(positions, indices, triangles));
  }

  /** The tree as plain arrays, to hand to another thread without copying. */
  parts(): BvhParts {
    return {
      order: this.#order,
      bounds: this.#bounds,
      meta: this.#meta,
      nodeCount: this.#nodeCount,
    };
  }

  get triangleCount(): number {
    return this.#order.length;
  }

  /** The bounds of the whole mesh: the root node, already computed. */
  bounds(out: Float32Array): void {
    for (let i = 0; i < 6; i++) out[i] = this.#nodeCount === 0 ? 0 : (this.#bounds[i] ?? 0);
  }

  /**
   * Nearest triangle along a ray, or false on a miss. With an unnormalised direction,
   * `hit.distance` is in units of that direction.
   */
  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    hit: RayHit,
  ): boolean {
    hit.triangle = -1;
    hit.distance = Number.POSITIVE_INFINITY;
    if (this.#nodeCount === 0) return false;

    // Reciprocals once so the slab test multiplies; Infinity for axis-aligned rays is handled.
    const rx = 1 / dx;
    const ry = 1 / dy;
    const rz = 1 / dz;

    let depth = 0;
    stack[depth++] = 0;

    while (depth > 0) {
      const node = stack[--depth] ?? 0;
      if (!this.#intersectsBox(node, ox, oy, oz, rx, ry, rz, hit.distance)) continue;

      const meta = node * 3;
      const count = this.#meta[meta + 1] ?? 0;

      if (count > 0) {
        const start = this.#meta[meta] ?? 0;
        for (let i = start; i < start + count; i++) {
          this.#testTriangle(this.#order[i] ?? 0, ox, oy, oz, dx, dy, dz, hit);
        }
        continue;
      }

      // Overflow would mean a pathological tree, not a big mesh; the subtree is then skipped.
      if (depth + 2 > MAX_STACK) continue;
      stack[depth++] = this.#meta[meta] ?? 0;
      stack[depth++] = this.#meta[meta + 2] ?? 0;
    }

    return hit.triangle >= 0;
  }

  // Building.

  /**
   * Returns the index of the node covering `[start, start + count)`. Boxes are built bottom-up
   * (leaves from triangles, inner nodes as the union of children); bounding every level from
   * triangles took 1.5 s on four million triangles. The split uses centroids only, in one pass.
   */
  #build(start: number, count: number, centroids: Float32Array): number {
    const node = this.#nodeCount++;

    if (count <= LEAF_SIZE) {
      this.#boundTriangles(node, start, count);
      this.#meta[node * 3] = start;
      this.#meta[node * 3 + 1] = count;
      return node;
    }

    const { axis, pivot } = this.#splitOf(start, count, centroids);
    let mid = this.#partition(start, count, axis, pivot, centroids);

    // All centroids on one side (common with coplanar fans): split by count so recursion ends.
    if (mid === start || mid === start + count) mid = start + (count >> 1);

    const left = this.#build(start, mid - start, centroids);
    const right = this.#build(mid, start + count - mid, centroids);

    this.#meta[node * 3] = left;
    this.#meta[node * 3 + 1] = 0;
    this.#meta[node * 3 + 2] = right;
    const b = node * 6;
    const l = left * 6;
    const r = right * 6;
    for (let i = 0; i < 3; i++) {
      this.#bounds[b + i] = Math.min(this.#bounds[l + i] ?? 0, this.#bounds[r + i] ?? 0);
      this.#bounds[b + 3 + i] = Math.max(
        this.#bounds[l + 3 + i] ?? 0,
        this.#bounds[r + 3 + i] ?? 0,
      );
    }
    return node;
  }

  /**
   * The axis of widest centroid spread and its spatial middle (cheaper than the median, and similar
   * for mostly boxy geometry).
   */
  #splitOf(start: number, count: number, centroids: Float32Array): { axis: number; pivot: number } {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (let i = start; i < start + count; i++) {
      const c = (this.#order[i] ?? 0) * 3;
      const x = centroids[c] ?? 0;
      const y = centroids[c + 1] ?? 0;
      const z = centroids[c + 2] ?? 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    const x = maxX - minX;
    const y = maxY - minY;
    const z = maxZ - minZ;
    if (x >= y && x >= z) return { axis: 0, pivot: (minX + maxX) / 2 };
    return y >= z ? { axis: 1, pivot: (minY + maxY) / 2 } : { axis: 2, pivot: (minZ + maxZ) / 2 };
  }

  #boundTriangles(node: number, start: number, count: number): void {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (let i = start; i < start + count; i++) {
      const tri = (this.#order[i] ?? 0) * 3;
      for (let corner = 0; corner < 3; corner++) {
        const p = (this.#indices[tri + corner] ?? 0) * 3;
        const x = this.#positions[p] ?? 0;
        const y = this.#positions[p + 1] ?? 0;
        const z = this.#positions[p + 2] ?? 0;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }
    }

    const b = node * 6;
    this.#bounds[b] = minX;
    this.#bounds[b + 1] = minY;
    this.#bounds[b + 2] = minZ;
    this.#bounds[b + 3] = maxX;
    this.#bounds[b + 4] = maxY;
    this.#bounds[b + 5] = maxZ;
  }

  /** Hoare-style partition of `#order` around `pivot` on one axis. */
  #partition(
    start: number,
    count: number,
    axis: number,
    pivot: number,
    centroids: Float32Array,
  ): number {
    let lo = start;
    let hi = start + count;
    while (lo < hi) {
      const tri = this.#order[lo] ?? 0;
      if ((centroids[tri * 3 + axis] ?? 0) < pivot) {
        lo++;
      } else {
        hi--;
        const swap = this.#order[hi] ?? 0;
        this.#order[hi] = tri;
        this.#order[lo] = swap;
      }
    }
    return lo;
  }

  // Intersection.

  /** Slab test. `limit` lets a node be skipped when a nearer hit already exists. */
  #intersectsBox(
    node: number,
    ox: number,
    oy: number,
    oz: number,
    rx: number,
    ry: number,
    rz: number,
    limit: number,
  ): boolean {
    const b = node * 6;

    const tx1 = ((this.#bounds[b] ?? 0) - ox) * rx;
    const tx2 = ((this.#bounds[b + 3] ?? 0) - ox) * rx;
    let near = Math.min(tx1, tx2);
    let far = Math.max(tx1, tx2);

    const ty1 = ((this.#bounds[b + 1] ?? 0) - oy) * ry;
    const ty2 = ((this.#bounds[b + 4] ?? 0) - oy) * ry;
    near = Math.max(near, Math.min(ty1, ty2));
    far = Math.min(far, Math.max(ty1, ty2));

    const tz1 = ((this.#bounds[b + 2] ?? 0) - oz) * rz;
    const tz2 = ((this.#bounds[b + 5] ?? 0) - oz) * rz;
    near = Math.max(near, Math.min(tz1, tz2));
    far = Math.min(far, Math.max(tz1, tz2));

    return far >= Math.max(near, 0) && near <= limit;
  }

  /**
   * Möller–Trumbore, keeping only hits nearer than the current best. No back-face culling, so the
   * inside of a shelled part is clickable.
   */
  #testTriangle(
    triangle: number,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    hit: RayHit,
  ): void {
    const t3 = triangle * 3;
    const a = (this.#indices[t3] ?? 0) * 3;
    const b = (this.#indices[t3 + 1] ?? 0) * 3;
    const c = (this.#indices[t3 + 2] ?? 0) * 3;

    const ax = this.#positions[a] ?? 0;
    const ay = this.#positions[a + 1] ?? 0;
    const az = this.#positions[a + 2] ?? 0;

    const e1x = (this.#positions[b] ?? 0) - ax;
    const e1y = (this.#positions[b + 1] ?? 0) - ay;
    const e1z = (this.#positions[b + 2] ?? 0) - az;

    const e2x = (this.#positions[c] ?? 0) - ax;
    const e2y = (this.#positions[c + 1] ?? 0) - ay;
    const e2z = (this.#positions[c + 2] ?? 0) - az;

    const hx = dy * e2z - dz * e2y;
    const hy = dz * e2x - dx * e2z;
    const hz = dx * e2y - dy * e2x;

    const det = e1x * hx + e1y * hy + e1z * hz;
    if (det > -EPSILON && det < EPSILON) return;

    const inv = 1 / det;
    const sx = ox - ax;
    const sy = oy - ay;
    const sz = oz - az;

    const u = inv * (sx * hx + sy * hy + sz * hz);
    if (u < 0 || u > 1) return;

    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;

    const v = inv * (dx * qx + dy * qy + dz * qz);
    if (v < 0 || u + v > 1) return;

    const t = inv * (e2x * qx + e2y * qy + e2z * qz);
    if (t <= EPSILON || t >= hit.distance) return;

    hit.triangle = triangle;
    hit.distance = t;
    hit.x = ox + dx * t;
    hit.y = oy + dy * t;
    hit.z = oz + dz * t;
  }
}

/** Triangle centroids, computed once and reused at every level of the build. */
function centroidsOf(
  positions: Float32Array,
  indices: Uint32Array,
  triangles: number,
): Float32Array {
  const centroids = new Float32Array(triangles * 3);
  for (let tri = 0; tri < triangles; tri++) {
    const t3 = tri * 3;
    for (let axis = 0; axis < 3; axis++) {
      const a = (indices[t3] ?? 0) * 3 + axis;
      const b = (indices[t3 + 1] ?? 0) * 3 + axis;
      const c = (indices[t3 + 2] ?? 0) * 3 + axis;
      centroids[t3 + axis] = ((positions[a] ?? 0) + (positions[b] ?? 0) + (positions[c] ?? 0)) / 3;
    }
  }
  return centroids;
}
