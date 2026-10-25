/**
 * The contract between the geometry kernel and everything above it: only what the CAD tool needs,
 * in our vocabulary. Every method is async because the real implementation runs in a Web Worker.
 */

import type { KernelResult } from './errors.js';
import type { FaceOutline } from './face-outlines.js';
import type { MeshedPacket, MeshPacket } from './mesh-parts.js';
import type { DrawingDirection, DrawingProjection } from './projection.js';
import type {
  Bounds,
  CylindricalFace,
  EdgeSet,
  FaceDescription,
  FaceHash,
  FaceMeasurement,
  Mesh,
  PartMotion,
  ShapeId,
  ShapeWithHistory,
  TessellationOptions,
  Vec3,
} from './types.js';

export interface ProfilePoint {
  x: number;
  y: number;
}

export type ProfileSegment =
  | { kind: 'line'; start: ProfilePoint; end: ProfilePoint }
  | { kind: 'arc'; start: ProfilePoint; mid: ProfilePoint; end: ProfilePoint }
  | { kind: 'circle'; center: ProfilePoint; radius: number }
  /**
   * A chain of cubic Bézier pieces, given by their poles: 3n + 1 of them for n pieces, each piece's
   * last pole the next one's first. `@bezier/core` decides the shape; the kernel builds exactly it.
   */
  | { kind: 'spline'; poles: readonly ProfilePoint[] }
  /**
   * An ellipse: `major` runs from the centre to the end of the long axis. Whole, or from the angle
   * `from` (measured from the long axis, counter-clockwise) through `sweep`.
   */
  | {
      kind: 'ellipse';
      center: ProfilePoint;
      major: ProfilePoint;
      minor: number;
      from?: number;
      sweep?: number;
    };

/** What a body measures as a whole. */
export interface MassProperties {
  volume: number;
  area: number;
  centre: Vec3;
}

/** A named part for STEP export: its faces (by hash) identify the solid; colour is 0xRRGGBB. */
export interface StepPart {
  name: string;
  faces: readonly FaceHash[];
  colour?: number;
}

/** A closed 2D profile, already solved and placed in 3D by `@bezier/core`. */
export interface Profile {
  /** Closed loops of exact segments, in millimetres, in the plane's coordinate system. */
  loops: readonly (readonly ProfileSegment[])[];
  /** Where the sketch plane sits in world space. */
  origin: Vec3;
  normal: Vec3;
  /** In-plane direction of the profile's local +X. */
  xDirection: Vec3;
}

/** How a file is read in. */
export interface ImportOptions {
  /**
   * Cache the read shape for the same file next time (`shape-store.ts`). Only where nothing depends
   * on exact floating-point values: a reread shape has the same faces in order, but measurements
   * can differ in the last bits.
   */
  reuse?: boolean;
  /** The file's `textKey`, if the caller already has it. */
  key?: string;
}

export interface GeometryKernel {
  sectionDrawing(shape: ShapeId, fraction: number): Promise<KernelResult<DrawingProjection>>;
  /** Where a shape meets a plane: world-space polylines, flat xyz, one per edge of the cut. */
  sectionByPlane(
    shape: ShapeId,
    plane: { origin: Vec3; normal: Vec3; xDirection: Vec3 },
  ): Promise<KernelResult<number[][]>>;
  projectDrawing(
    shape: ShapeId,
    direction: DrawingDirection,
  ): Promise<KernelResult<DrawingProjection>>;
  // Creating solids.

  /**
   * Extrudes a closed profile along its normal. `taper` is a draft angle in degrees: walls lean in,
   * or out when negative.
   */
  extrude(profile: Profile, distance: number, taper?: number): Promise<KernelResult<ShapeId>>;

  /** Extrude an existing planar face along its outward normal. Signed distance. */
  extrudeFace(face: ShapeId, distance: number): Promise<KernelResult<ShapeId>>;

  /**
   * A solid through the outlines of two or more profiles, in order (ADR 0017): smooth, or with
   * straight sides between sections when `ruled`.
   */
  loft(profiles: readonly Profile[], ruled?: boolean): Promise<KernelResult<ShapeId>>;

  /**
   * A profile's outline carried along a path, keeping its angle to the path (ADR 0017). The path's
   * one loop is its chain of segments in order, open or closed.
   */
  sweep(profile: Profile, path: Profile): Promise<KernelResult<ShapeId>>;

  /**
   * A profile wrapped round a cylindrical face (`wrap.ts`): raised shapes to join when `depth` is
   * positive, grooves to cut when negative.
   */
  wrapTool(face: ShapeId, profile: Profile, depth: number): Promise<KernelResult<ShapeId>>;

  /** Spin a closed profile around an axis. */
  revolve(
    profile: Profile,
    axisOrigin: Vec3,
    axisDirection: Vec3,
    angleRadians: number,
    /** Rise along the axis per turn: a thread or a spring. Zero, or left out, turns in place. */
    pitch?: number,
  ): Promise<KernelResult<ShapeId>>;

  // Combining solids.

  /**
   * Union, with face history. With `merge`, touching faces on one surface are merged (a pulled wall
   * stays one wall). Off by default since it changes the faces a saved document names; if merged
   * faces cannot be traced back, the union is returned with its seams.
   */
  fuse(
    a: ShapeId,
    b: ShapeId,
    options?: { merge?: boolean },
  ): Promise<KernelResult<ShapeWithHistory>>;
  /** Partition by owning solid, never by cutting selected faces out of a shell. */
  partition(
    solid: ShapeId,
    faces: readonly ShapeId[],
  ): Promise<KernelResult<{ selected: ShapeId; remainder: ShapeId | null }>>;
  /** `partition` with faces given by hash, avoiding describing every face to get handles. */
  partitionByHashes(
    solid: ShapeId,
    faces: readonly FaceHash[],
  ): Promise<KernelResult<{ selected: ShapeId; remainder: ShapeId | null }>>;
  solidFaceGroups(
    solid: ShapeId,
  ): Promise<KernelResult<readonly (readonly import('./types.js').FaceHash[])[]>>;
  /** Keep both solids independent, including when their volumes overlap. */
  compound(original: ShapeId, copy: ShapeId): Promise<KernelResult<ShapeWithHistory>>;

  /**
   * A boolean between two existing bodies that follows the faces of both, unlike `fuse`, `cut` and
   * `intersect`, whose fresh tools have no names to keep. OCCT reports the tool's faces once their
   * hashes are queried.
   */
  combine(
    kind: 'fuse' | 'cut' | 'intersect',
    target: ShapeId,
    tool: ShapeId,
  ): Promise<KernelResult<ShapeWithHistory>>;

  /**
   * A deep copy with faces of its own. A boolean result shares untouched faces with its inputs, and
   * two faces with one identity cannot both be named; this lets Combine keep its tools.
   */
  duplicate(shape: ShapeId): Promise<KernelResult<ShapeId>>;

  /** How two bodies meet: apart, touching (sharing a face, edge or point only), or overlapping. */
  contact(a: ShapeId, b: ShapeId): Promise<KernelResult<'apart' | 'touching' | 'overlapping'>>;

  /**
   * The solids of `body` that touch or overlap `near`, each by one naming face hash and how it
   * meets; null when more than `limit` are close. One call with a per-solid box prefilter, since a
   * `contact` per solid took minutes on a 1,715-solid assembly.
   */
  contactsNear(
    body: ShapeId,
    near: ShapeId,
    limit: number,
  ): Promise<
    KernelResult<readonly { face: FaceHash; contact: 'touching' | 'overlapping' }[] | null>
  >;

  /** Cut a solid in two along a plane. Both halves come back, as separate solids. */
  splitByPlane(solid: ShapeId, origin: Vec3, normal: Vec3): Promise<KernelResult<ShapeWithHistory>>;

  /** Subtract `tool` from `target`. */
  cut(target: ShapeId, tool: ShapeId): Promise<KernelResult<ShapeWithHistory>>;

  /** Keep only the overlap. */
  intersect(a: ShapeId, b: ShapeId): Promise<KernelResult<ShapeWithHistory>>;

  // Moving solids.

  /**
   * Moves a solid. Returns evolution data like other operations, so fillets, selections and
   * downstream features stay attached.
   */
  translate(solid: ShapeId, by: Vec3): Promise<KernelResult<ShapeWithHistory>>;

  /**
   * Rotates a solid about the axis through `axisOrigin` along `axisDirection`, right-handed, in
   * radians.
   */
  rotate(
    solid: ShapeId,
    axisOrigin: Vec3,
    axisDirection: Vec3,
    angleRadians: number,
  ): Promise<KernelResult<ShapeWithHistory>>;

  /**
   * Moves faces, edges and corners of a solid and lets neighbouring faces follow
   * (`tweak-parts.ts`). Refused, with a reason, where a face would vanish, split or invert.
   */
  moveParts(
    solid: ShapeId,
    parts: readonly ShapeId[],
    motion: PartMotion,
  ): Promise<KernelResult<ShapeWithHistory>>;

  /**
   * Offsets faces along their outward normal by `distance` (inward when negative); neighbours
   * follow as for `moveParts`.
   */
  offsetFaces(
    solid: ShapeId,
    faces: readonly ShapeId[],
    distance: number,
  ): Promise<KernelResult<ShapeWithHistory>>;

  /** Scales about `center`, uniformly or per axis. Faces keep their identity. */
  scale(
    solid: ShapeId,
    center: Vec3,
    factor: number | Vec3,
  ): Promise<KernelResult<ShapeWithHistory>>;

  /** The mirror image of a solid in the plane through `point` with `normal`. */
  mirror(solid: ShapeId, point: Vec3, normal: Vec3): Promise<KernelResult<ShapeWithHistory>>;

  // Modifying solids.

  /** Rounds the given edges. Fails on real geometry more often than any other operation. */
  fillet(
    solid: ShapeId,
    edges: readonly ShapeId[],
    radius: number,
  ): Promise<KernelResult<ShapeWithHistory>>;

  /**
   * Removes faces and extends neighbours over the gap (undoing a fillet or chamfer, removing a boss
   * or pocket). Refused where the neighbours cannot close it.
   */
  removeFaces(solid: ShapeId, faces: readonly ShapeId[]): Promise<KernelResult<ShapeWithHistory>>;

  /** Bevel the given edges. */
  chamfer(
    solid: ShapeId,
    edges: readonly ShapeId[],
    distance: number,
    /** The second leg, on the other face beside each edge, when asymmetric. */
    other?: number,
  ): Promise<KernelResult<ShapeWithHistory>>;

  /** Hollows a solid, removing the given faces to leave an opening. */
  shell(
    solid: ShapeId,
    facesToRemove: readonly ShapeId[],
    thickness: number,
  ): Promise<KernelResult<ShapeWithHistory>>;

  /** Resize a complete cylindrical hole or boss without scaling the owning body. */
  resizeCylinder(
    solid: ShapeId,
    face: ShapeId,
    radius: number,
  ): Promise<KernelResult<ShapeWithHistory>>;
  /** Exact classification; null for non-cylinders or partial/irregular walls. */
  faceCylinder(face: ShapeId): Promise<KernelResult<CylindricalFace | null>>;

  // Reading geometry back.

  /**
   * The faces, edges or vertices of a shape, as ordinary `ShapeId`s to dispose. Positional and not
   * stable across rebuilds; never persist them (durable references are `@bezier/core`'s job,
   * ADR 0001).
   */
  subShapes(
    shape: ShapeId,
    type: 'face' | 'edge' | 'vertex',
  ): Promise<KernelResult<readonly ShapeId[]>>;

  /**
   * Describes every face: handle, hash and geometric signature. The naming layer follows
   * `EvolutionData` by hash and breaks ties (e.g. a split face) by signature.
   */
  describeFaces(shape: ShapeId): Promise<KernelResult<readonly FaceDescription[]>>;

  /**
   * Every face's hash in `describeFaces` order, without handles (which each need a dispose call;
   * 108,000 messages per rebuild on a large assembly).
   */
  faceHashes(shape: ShapeId): Promise<KernelResult<readonly FaceHash[]>>;

  /**
   * Area and centroid for specific faces, batched and separate from `describeFaces` since they
   * cost about 3 ms over a 106-face body against 0.02 ms for the rest.
   */
  measureFaces(faces: readonly ShapeId[]): Promise<KernelResult<readonly FaceMeasurement[]>>;
  /** A body's volume (mm³), the area of all its faces (mm²) and its centre of mass. */
  massProperties(shape: ShapeId): Promise<KernelResult<MassProperties>>;

  /** Axis-aligned bounds; the naming layer needs a deterministic, not exact, reference. */
  bounds(shape: ShapeId): Promise<KernelResult<Bounds>>;

  /**
   * The edge where two faces meet, or null unless exactly one. Resolves an `EdgeRef`, which names
   * an edge by its two adjacent faces.
   */
  sharedEdge(faceA: ShapeId, faceB: ShapeId): Promise<KernelResult<ShapeId | null>>;

  /** The one corner all of `faces` meet at, or null when there is none or it is ambiguous. */
  sharedVertex(faces: readonly ShapeId[]): Promise<KernelResult<ShapeId | null>>;

  /** The plane of a planar face (a point and the outward normal), for sketches on faces. */
  facePlane(face: ShapeId): Promise<KernelResult<{ origin: Vec3; normal: Vec3 }>>;

  /** Triangulate for display. */
  tessellate(shape: ShapeId, options?: TessellationOptions): Promise<KernelResult<Mesh>>;

  /** Pull out the sharp lines for display. See the note on `EdgeSet`. */
  extractEdges(shape: ShapeId, options?: TessellationOptions): Promise<KernelResult<EdgeSet>>;

  /**
   * Some solids of a body at their own detail level (`solid-detail.ts`). `solids` are positions in
   * the body's mesh (`Mesh.solidTriangles`); faces are numbered as in that mesh.
   */
  tessellateSolids(
    shape: ShapeId,
    solids: readonly number[],
    options: TessellationOptions,
  ): Promise<KernelResult<Mesh>>;

  /** The outlines of some solids of a body, as `tessellateSolids` picks them. */
  extractSolidEdges(
    shape: ShapeId,
    solids: readonly number[],
    options: TessellationOptions,
  ): Promise<KernelResult<EdgeSet>>;

  /**
   * A large body's parts as BREP packets of about equal work for helper workers (`mesh-parts.ts`);
   * null when there are fewer parts than packets.
   */
  splitForMeshing(shape: ShapeId, count: number): Promise<KernelResult<MeshPacket[] | null>>;

  /** A packet from `splitForMeshing` meshed and outlined, in the store's format. */
  meshPacket(brep: Uint8Array, options: TessellationOptions): Promise<KernelResult<MeshedPacket>>;

  /**
   * Adopts a packet meshed elsewhere, so the next `tessellate` and `extractEdges` of `shape` at
   * `options` find those parts done. False when it does not fit.
   */
  adoptMeshes(
    shape: ShapeId,
    packet: { first: number; end: number } & MeshedPacket,
    options: TessellationOptions,
  ): Promise<KernelResult<boolean>>;

  // Files.

  /** STEP export as text. */
  exportStep(shape: ShapeId): Promise<KernelResult<string>>;
  /**
   * STEP export as file bytes, built in parts: a large assembly exceeds the maximum browser string
   * length (the Voron is about 750 million characters).
   */
  exportStepFile(shape: ShapeId, parts?: readonly StepPart[]): Promise<KernelResult<Uint8Array>>;

  /** Binary STL export. */
  exportStl(shape: ShapeId, options?: TessellationOptions): Promise<KernelResult<Uint8Array>>;

  importStep(data: string, options?: ImportOptions): Promise<KernelResult<ShapeId>>;
  /**
   * The planar faces of a shape as point outlines on their planes, outer boundary first, for files
   * of loose surfaces with no solid (audit F-017).
   */
  flatOutlines(shape: ShapeId): Promise<KernelResult<FaceOutline[]>>;

  /** Imports IGES; loose trimmed surfaces are sewn into solids where they close. */
  importIges(data: string): Promise<KernelResult<ShapeId>>;

  /**
   * The shape stored under `key` (a `textKey`), or null. Asked before `importStep` so a stored
   * file's text (241 MB for the Voron) is never sent to the worker.
   */
  importKept(key: string): Promise<KernelResult<ShapeId | null>>;

  /**
   * Part names of a stored import's solids in shape order, with each solid's face count. Null when
   * the file names none; undefined when unknown and no text was given.
   */
  importNames(
    key: string,
    data?: string,
  ): Promise<KernelResult<{ names: (string | null)[]; faces: number[] } | null | undefined>>;
  /**
   * Face colours of the import under `key` in `faceHashes` order: 0xRRGGBB, or 0xFFFFFFFF for none.
   * Null when the file has none; undefined when unknown, in which case pass the text (only then,
   * since it can be hundreds of megabytes) to read and store them.
   */
  importColours(key: string, data?: string): Promise<KernelResult<Uint32Array | null | undefined>>;

  // Memory.

  /**
   * Releases a shape. Kernel memory is outside the JS heap, so undisposed shapes leak;
   * `@bezier/core` owns shape lifetimes.
   */
  dispose(shape: ShapeId): Promise<void>;

  /**
   * Stops the current work by restarting the engine; all shapes handed out are lost. Only the
   * worker kernel implements it.
   */
  cancel?(): void;

  /** How many shapes are currently alive. Used by tests to catch leaks. */
  liveShapeCount(): Promise<number>;

  /**
   * Waits until pending store writes (shapes, meshes, outlines) finish, before shutting a kernel
   * down.
   */
  flushStore(): Promise<void>;
}

/** Configuration for bringing the kernel up. */
export interface KernelOptions {
  /**
   * Where to fetch the OCCT `.wasm` from, so users can substitute their own build (LGPL, ADR 0003)
   * and the desktop build can load it from disk.
   */
  wasmUrl?: string;
}
