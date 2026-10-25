/**
 * Vocabulary types for the geometry layer. The only geometry concepts that cross out of
 * this package; raw kernel handles never leave.
 */

/** An opaque, branded reference to a shape in the kernel. Only the kernel can resolve it. */
export type ShapeId = number & { readonly __brand: 'ShapeId' };

/**
 * The kernel's identifier for one face of a solid, valid within one session only. Treat it as
 * short-lived; stable references are built in `@bezier/core`.
 */
export type FaceHash = number & { readonly __brand: 'FaceHash' };

/** A point or direction in 3D. Units are millimetres, always. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * How picked faces, edges and corners move: a right-handed turn in radians about an axis through
 * `origin`, then a slide.
 */
export interface PartMotion {
  by: Vec3;
  turn?: { origin: Vec3; axis: Vec3; angle: number } | undefined;
}

/** Exact, complete cylindrical wall suitable for a radius edit. Units are millimetres. */
export interface CylindricalFace {
  radius: number;
  origin: Vec3;
  axis: Vec3;
  radial: Vec3;
  height: number;
  inward: boolean;
}

/**
 * What an operation did to one input face; threaded through rebuilds so references survive edits
 * to earlier features. OCCT reports faces only; edge and vertex identity is derived from adjacent
 * faces in `@bezier/core`.
 */
export interface FaceEvolution {
  /** The face as it existed before the operation. */
  from: FaceHash;
  /** What it became: usually one face, several when split (then `@bezier/core` must choose). */
  to: readonly FaceHash[];
}

export interface EvolutionData {
  /** Input faces that survived in some altered form, and what they became. */
  modified: readonly FaceEvolution[];
  /**
   * Result faces with no input ancestor (a fillet surface, a new pocket wall). Derived by
   * subtraction, since the binding cannot query generation from edges (ADR 0001).
   */
  generated: readonly FaceHash[];
  /** Faces that went in and did not come out. */
  deleted: readonly FaceHash[];
  /** Input faces the operation left completely alone. */
  unchanged: readonly FaceHash[];
}

/** A shape plus the record of how it came to be. */
export interface ShapeWithHistory {
  shape: ShapeId;
  evolution: EvolutionData;
}

/**
 * Triangulated geometry for the renderer, as flat typed arrays so it is transferred, not cloned,
 * across the worker boundary.
 */
export interface Mesh {
  /** xyz triples. Length is `vertexCount * 3`. */
  positions: Float32Array;
  /** xyz triples, one per vertex. */
  normals: Float32Array;
  /** Triangle indices into `positions`. */
  indices: Uint32Array;
  /**
   * Each triangle's face, as an index into `describeFaces()`; length `indices.length / 3`. Not a
   * `FaceHash`: the mesh and the naming layer hash with different upper bounds (`occt-kernel.ts`).
   */
  triangleFaces: Uint32Array;
  /**
   * Start of each solid's triangle run, plus the end (length solids + 1), so the viewport can draw
   * or replace one part alone. Absent when the whole mesh is one solid.
   */
  solidTriangles?: Uint32Array;
  /** The same runs in vertices: a solid's vertices lie together too. */
  solidVertices?: Uint32Array;
}

/** Part of a mesh still being made, shown while the rest is meshed. Not pickable. */
export interface MeshPiece {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/** The sharp edges of a solid, extracted separately from the mesh. */
export interface EdgeSet {
  /** Concatenated polylines as xyz triples. */
  positions: Float32Array;
  /** Index into `positions` where each polyline starts. */
  polylineStarts: Uint32Array;
  /** First polyline of each solid, plus the count (length solids + 1). Absent when unknown. */
  solidLines?: Uint32Array;
}

/**
 * What the naming layer needs about one face, batched into one call since it crosses the worker
 * boundary on every rebuild.
 */
export interface FaceDescription {
  /** Live handle. Valid for this rebuild pass only. */
  id: ShapeId;
  /** The kernel's hash, valid only within this rebuild (ADR 0001). Never persist it. */
  hash: FaceHash;
  /** Plane, cylinder, sphere, torus, bspline… Part of the geometric signature. */
  surfaceType: string;
}

/**
 * The expensive half of a face's signature: 94% of the cost of describing a face (1.45 ms area,
 * 1.56 ms centroid vs 0.018 ms hash over a 106-face body), so fetched only for faces being named.
 */
export interface FaceMeasurement {
  area: number;
  centre: Vec3;
}

/** An axis-aligned box. Cheap, and enough to locate a body deterministically. */
export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** How finely to triangulate. Lower deflection means more triangles. */
export interface TessellationOptions {
  /** Maximum deviation from the true surface, in millimetres. */
  linearDeflection: number;
  /** Maximum angular deviation, in radians. */
  angularDeflection: number;
}

export const DEFAULT_TESSELLATION: TessellationOptions = {
  linearDeflection: 0.05,
  angularDeflection: 0.3,
};
