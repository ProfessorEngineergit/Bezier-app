/**
 * `GeometryKernel` on occt-wasm. No worker or DOM dependency; `createKernel()` decides where it
 * runs. Geometry failures return `KernelResult` and never throw.
 */

import { CONTACT_TOLERANCE, contactsNear } from './contacts.js';
import { describeCylinder, resizeCylinder } from './cylindrical-face.js';
import { sectionBrep, sectionByPlaneBrep } from './drawing-section.js';
import { joinByPart } from './edge-parts.js';
import type { KernelResult } from './errors.js';
import { helicalSweep } from './helical.js';
import { ImportColours } from './import-colours.js';
import { KeptDisplays } from './kept-displays.js';
import type { GeometryKernel, MassProperties, Profile } from './kernel.js';
import { locatedMove } from './located-move.js';
import { loftThrough, sweepAlong } from './loft-sweep.js';
import { ShapeDisplay } from './occt-display.js';
import { ShapeFiles } from './occt-files.js';
import {
  attempt,
  bothSides,
  decodeEvolutionTriples,
  extrudedFace,
  planeOfFace,
  sameFaces,
  stretchAbout,
  vertexWhereFacesMeet,
} from './occt-support.js';
import { roundOrOverflow } from './overflow-round.js';
import { faceFromProfile } from './profile-face.js';
import { type DrawingDirection, type DrawingProjection, projectBrep } from './projection.js';
import { COMBINE_REFUSED, mergedOrAsMade } from './refine-history.js';
import type { ShapeStore } from './shape-store.js';
import { boundsOf, type Counted, perSolid, SolidCache } from './tessellation.js';
import { offsetFaces, tweakParts } from './tweak-parts.js';
import type {
  Bounds,
  CylindricalFace,
  EvolutionData,
  FaceDescription,
  FaceHash,
  FaceMeasurement,
  MeshPiece,
  PartMotion,
  ShapeId,
  ShapeWithHistory,
  Vec3,
} from './types.js';
import { loadOcct, type OcctLoadOptions } from './wasm.js';
import { wrapTool } from './wrap.js';

/**
 * Upper bound for OCCT hashes; a prime keeps the distribution even. Hashes are valid only within
 * one rebuild pass and never persisted (ADR 0001). At 1,000,003, 10,816 of the Voron's 107,855
 * faces collided (`tools/spikes/face-hash-collisions.ts`).
 */
const HASH_UPPER_BOUND = 2_147_483_647;

/** occt-wasm's raw kernel. Typed loosely here so the façade owns the vocabulary. */
type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;
/** What occt-wasm's `…WithHistory` calls hand back (`#withHistory`). */
type RawEvolution = ReturnType<RawKernel['filletWithHistory']>;

export class OcctGeometryKernel implements GeometryKernel {
  readonly #occt: RawKernel;

  /**
   * `ShapeId`s are opaque integers minted here, not occt-wasm handles, so callers cannot forge one
   * and swapping the binding (ADR 0001) changes no type above this package.
   */
  readonly #shapes = new Map<number, RawHandle>();
  /**
   * Face descriptions of solids already described, with their handles. Never evicted: rebuild
   * cache snapshots hold these handles. Grows only by the faces of solids an edit made.
   */
  readonly #faces = new SolidCache<Counted<FaceDescription[]>>(
    ({ value }) => value.length,
    Number.POSITIVE_INFINITY,
  );
  readonly #pinned = new Set<number>();
  /** Loose boxes of solids already seen (`nearSolids`), a few numbers each. */
  readonly #boxes = new SolidCache<ReturnType<RawKernel['getBoundingBox']>>(() => 1, 100_000);
  #nextId = 1;

  /** Called between pieces of long work so the worker can report it is alive. */
  readonly #alive: (budgetMs?: number) => void;

  constructor(
    occt: RawKernel,
    store?: ShapeStore,
    alive: (budgetMs?: number) => void = () => {},
    stream?: (piece: MeshPiece) => void,
  ) {
    this.#occt = occt;
    this.#kept = store === undefined ? undefined : new KeptDisplays(occt, store);
    this.#colours = new ImportColours(occt, store);
    this.#alive = alive;
    this.#files = new ShapeFiles(occt, {
      track: (handle) => this.#track(handle),
      resolve: (id) => this.#resolve(id),
      faceHashes: (shape) => this.#faceHashes(shape),
      alive,
      store,
      kept: this.#kept,
      colours: this.#colours,
    });
    this.#display = new ShapeDisplay(occt, {
      resolve: (id) => this.#resolve(id),
      alive,
      stream,
      kept: this.#kept,
    });
  }

  readonly #files: ShapeFiles;
  readonly #display: ShapeDisplay;

  /** The meshes and outlines of imports, kept beside their shapes (`kept-displays.ts`). */
  readonly #kept: KeptDisplays | undefined;

  /** The colours of imports, kept beside their shapes (`import-colours.ts`). */
  readonly #colours: ImportColours;

  #track(handle: RawHandle): ShapeId {
    const id = this.#nextId++;
    this.#shapes.set(id, handle);
    return id as ShapeId;
  }

  /**
   * Resolves an id to a kernel handle. Throws, since an unknown or disposed id is a programmer
   * error, not a geometry failure.
   */
  #resolve(id: ShapeId): RawHandle {
    const handle = this.#shapes.get(id);
    if (handle === undefined) {
      throw new Error(`shape ${id} is not alive — it was disposed, or never existed`);
    }
    return handle;
  }

  #faceHashes(shape: RawHandle): FaceHash[] {
    return this.#occt.subShapeHashes(shape, 'face', HASH_UPPER_BOUND) as FaceHash[];
  }

  // Creating solids.

  async extrude(profile: Profile, distance: number, taper = 0): Promise<KernelResult<ShapeId>> {
    return attempt('open-profile', 'This sketch could not be turned into a solid.', () => {
      const face = faceFromProfile(this.#occt, profile);
      const n = profile.normal;
      const [dx, dy, dz] = [n.x * distance, n.y * distance, n.z * distance];
      // Drafted, the walls lean in by `taper` degrees as they rise (out when negative).
      const solid =
        Math.abs(taper) > 1e-9
          ? this.#occt.draftPrism(face, dx, dy, dz, taper)
          : this.#occt.extrude(face, dx, dy, dz);
      return this.#track(solid);
    });
  }

  async extrudeFace(face: ShapeId, distance: number): Promise<KernelResult<ShapeId>> {
    return attempt(
      'invalid-result',
      'This face could not be extruded. Select a flat face and a non-zero distance.',
      () => this.#track(extrudedFace(this.#occt, this.#resolve(face), distance)),
    );
  }

  async loft(profiles: readonly Profile[], ruled = false): Promise<KernelResult<ShapeId>> {
    return attempt('open-profile', 'These sections could not be lofted into a solid.', () =>
      this.#track(loftThrough(this.#occt, profiles, ruled)),
    );
  }

  async wrapTool(face: ShapeId, profile: Profile, depth: number): Promise<KernelResult<ShapeId>> {
    return attempt('invalid-result', 'This could not be wrapped onto the face.', () =>
      this.#track(wrapTool(this.#occt, this.#resolve(face), profile, depth)),
    );
  }

  async sweep(profile: Profile, path: Profile): Promise<KernelResult<ShapeId>> {
    return attempt('open-profile', 'The profile could not be swept along this path.', () =>
      this.#track(sweepAlong(this.#occt, profile, path)),
    );
  }

  async revolve(
    profile: Profile,
    axisOrigin: Vec3,
    axisDirection: Vec3,
    angleRadians: number,
    pitch = 0,
  ): Promise<KernelResult<ShapeId>> {
    return attempt('open-profile', 'This sketch could not be revolved into a solid.', () => {
      const face = faceFromProfile(this.#occt, profile);
      const turns = angleRadians / (2 * Math.PI);
      return this.#track(
        Math.abs(pitch) > 1e-9
          ? helicalSweep(this.#occt, face, axisOrigin, axisDirection, turns, pitch)
          : this.#occt.revolve(face, { point: axisOrigin, direction: axisDirection }, angleRadians),
      );
    });
  }

  // Combining solids.

  partition(
    body: ShapeId,
    faces: readonly ShapeId[],
  ): Promise<KernelResult<{ selected: ShapeId; remainder: ShapeId | null }>> {
    return this.partitionByHashes(
      body,
      faces.map((face) => this.#occt.hashCode(this.#resolve(face), HASH_UPPER_BOUND) as FaceHash),
    );
  }

  partitionByHashes(
    body: ShapeId,
    faces: readonly FaceHash[],
  ): Promise<KernelResult<{ selected: ShapeId; remainder: ShapeId | null }>> {
    return Promise.resolve(
      attempt('invalid-result', 'The selected body could not be found.', () => {
        const wanted = new Set<number>(faces);
        const solids = this.#occt.getSubShapes(this.#resolve(body), 'solid');
        try {
          const selected = solids.filter((solid) =>
            this.#faceHashes(solid).some((hash) => wanted.has(hash)),
          );
          const remaining = solids.filter((solid) => !selected.includes(solid));
          if (selected.length === 0) throw new Error('No solid owns the selected faces.');
          return {
            selected: this.#track(this.#occt.makeCompound(selected)),
            remainder: remaining.length ? this.#track(this.#occt.makeCompound(remaining)) : null,
          };
        } finally {
          for (const solid of solids) this.#occt.release(solid);
        }
      }),
    );
  }

  solidFaceGroups(body: ShapeId): Promise<KernelResult<readonly (readonly FaceHash[])[]>> {
    return Promise.resolve(
      attempt('invalid-result', 'The bodies could not be read.', () => {
        const solids = this.#occt.getSubShapes(this.#resolve(body), 'solid');
        try {
          return solids.map((solid) => this.#faceHashes(solid) as FaceHash[]);
        } finally {
          for (const solid of solids) this.#occt.release(solid);
        }
      }),
    );
  }

  compound(original: ShapeId, copy: ShapeId): Promise<KernelResult<ShapeWithHistory>> {
    return Promise.resolve(
      attempt('invalid-result', 'These bodies could not be kept side by side.', () => {
        const source = this.#resolve(original);
        const duplicate = this.#resolve(copy);
        const unchanged = this.#faceHashes(source) as FaceHash[];
        const generated = this.#faceHashes(duplicate) as FaceHash[];
        return {
          shape: this.#track(this.#occt.makeCompound([source, duplicate])),
          evolution: { unchanged, generated, modified: [], deleted: [] },
        };
      }),
    );
  }

  #boolean(
    kind: 'fuse' | 'cut' | 'intersect',
    a: ShapeId,
    b: ShapeId,
    message: string,
    followTool = false,
    merge = false,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return Promise.resolve(
      attempt('boolean-failed', message, () => {
        const left = this.#resolve(a);
        const right = this.#resolve(b);
        // Passing the tool's hashes makes OCCT report how the tool's faces fared (ADR 0012). Only a
        // combine needs that; a fresh extrude tool's faces have no names to carry.
        const inputHashes = followTool
          ? [...this.#faceHashes(left), ...this.#faceHashes(right)]
          : this.#faceHashes(left);

        const made =
          kind === 'fuse'
            ? this.#occt.fuseWithHistory(left, right, inputHashes, HASH_UPPER_BOUND)
            : kind === 'cut'
              ? this.#occt.cutWithHistory(left, right, inputHashes, HASH_UPPER_BOUND)
              : this.#occt.intersectWithHistory(left, right, inputHashes, HASH_UPPER_BOUND);
        const evolution = mergedOrAsMade(this.#occt, made, inputHashes, HASH_UPPER_BOUND, merge);
        const traced = this.#withHistory(inputHashes, evolution);
        if (!followTool) return traced;
        // Tool faces a cut discards are not always reported deleted; treating them as unchanged
        // would keep a name alive for a face the body lacks.
        const present = new Set<number>(this.#faceHashes(evolution.result));
        const unchanged = traced.evolution.unchanged.filter((hash) => present.has(hash));
        return { shape: traced.shape, evolution: { ...traced.evolution, unchanged } };
      }),
    );
  }

  /**
   * Converts occt-wasm's evolution data into `ShapeWithHistory`, which `@bezier/core` uses to keep
   * selections across a rebuild.
   */
  #withHistory(inputHashes: readonly FaceHash[], evolution: RawEvolution): ShapeWithHistory {
    // occt-wasm documents `modified` as a hash list; it is actually flat
    // [inputHash, count, ...newHashes] records (checked against 3.8.3; tools/spikes/, ADR 0001).
    const modified = decodeEvolutionTriples(evolution.modified);
    const deleted = evolution.deleted as FaceHash[];

    const accountedFor = new Set<number>();
    for (const entry of modified) for (const hash of entry.to) accountedFor.add(hash);

    const touched = new Set<number>([...modified.map((m) => m.from), ...deleted]);
    const unchanged = inputHashes.filter((h) => !touched.has(h));
    for (const hash of unchanged) accountedFor.add(hash);

    // The binding only queries generation from faces, but a fillet surface is generated from an
    // edge, so `generated` comes back empty. Recover it by subtraction: any result face not traced
    // to an input is new.
    const resultFaces = this.#faceHashes(evolution.result);
    const generated = resultFaces.filter((h) => !accountedFor.has(h));

    return {
      shape: this.#track(evolution.result),
      evolution: { modified, generated, deleted, unchanged } satisfies EvolutionData,
    };
  }

  /**
   * Moving solids. Move and turn report history like a boolean (`locatedMove`,
   * `rotateWithHistory`); without it a body loses its fillets and selections.
   */
  translate(solid: ShapeId, by: Vec3): Promise<KernelResult<ShapeWithHistory>> {
    return Promise.resolve(
      attempt('invalid-result', 'This body could not be moved.', () => {
        const shape = this.#resolve(solid);
        const located = locatedMove(this.#occt, shape, by, (s) => this.#faceHashes(s));
        if (located !== null) {
          this.#kept?.follow(shape, located.moved, by);
          return { shape: this.#track(located.moved), evolution: located.evolution };
        }
        const hashes = this.#faceHashes(shape);
        const { x, y, z } = by;
        return this.#withHistory(
          hashes,
          this.#occt.translateWithHistory(shape, x, y, z, hashes, HASH_UPPER_BOUND),
        );
      }),
    );
  }

  rotate(
    solid: ShapeId,
    axisOrigin: Vec3,
    axisDirection: Vec3,
    angleRadians: number,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return Promise.resolve(
      attempt('invalid-result', 'This body could not be rotated.', () => {
        const shape = this.#resolve(solid);
        const inputHashes = this.#faceHashes(shape);
        const evolution = this.#occt.rotateWithHistory(
          shape,
          { point: axisOrigin, direction: axisDirection },
          angleRadians,
          inputHashes,
          HASH_UPPER_BOUND,
        );
        return this.#withHistory(inputHashes, evolution);
      }),
    );
  }

  fuse(
    a: ShapeId,
    b: ShapeId,
    options?: { merge?: boolean },
  ): Promise<KernelResult<ShapeWithHistory>> {
    return this.#boolean('fuse', a, b, COMBINE_REFUSED.shapes, false, options?.merge === true);
  }

  cut(target: ShapeId, tool: ShapeId): Promise<KernelResult<ShapeWithHistory>> {
    return this.#boolean('cut', target, tool, 'This cut could not be applied.');
  }

  intersect(a: ShapeId, b: ShapeId): Promise<KernelResult<ShapeWithHistory>> {
    return this.#boolean('intersect', a, b, 'These two shapes could not be intersected.');
  }

  combine(
    kind: 'fuse' | 'cut' | 'intersect',
    target: ShapeId,
    tool: ShapeId,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return this.#boolean(kind, target, tool, COMBINE_REFUSED[kind], true);
  }

  duplicate(shape: ShapeId): Promise<KernelResult<ShapeId>> {
    return Promise.resolve(
      attempt('invalid-result', 'This body could not be copied.', () =>
        this.#track(this.#occt.copy(this.#resolve(shape))),
      ),
    );
  }

  contact(a: ShapeId, b: ShapeId): Promise<KernelResult<'apart' | 'touching' | 'overlapping'>> {
    return Promise.resolve(
      attempt('invalid-result', 'Could not tell whether these bodies meet.', () => {
        const left = this.#resolve(a);
        const right = this.#resolve(b);
        if (this.#occt.distanceBetween(left, right) > CONTACT_TOLERANCE) return 'apart';
        const shared = this.#occt.common(left, right);
        try {
          return this.#occt.getVolume(shared) > CONTACT_TOLERANCE ? 'overlapping' : 'touching';
        } finally {
          this.#occt.release(shared);
        }
      }),
    );
  }

  contactsNear(
    body: ShapeId,
    near: ShapeId,
    limit: number,
  ): Promise<
    KernelResult<readonly { face: FaceHash; contact: 'touching' | 'overlapping' }[] | null>
  > {
    return Promise.resolve(
      attempt('invalid-result', 'Could not find the bodies it meets.', () => {
        const target = this.#resolve(near);
        return contactsNear(
          this.#occt,
          this.#resolve(body),
          target,
          limit,
          this.#boxes,
          (solid) => this.#faceHashes(solid),
          () => this.#alive(),
        );
      }),
    );
  }

  splitByPlane(
    solid: ShapeId,
    origin: Vec3,
    normal: Vec3,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return Promise.resolve(
      attempt('boolean-failed', 'This body could not be split there.', () => {
        const target = this.#resolve(solid);
        const inputHashes = this.#faceHashes(target);
        const half = this.#occt.halfSpace(origin, normal);
        try {
          // The halves are the body minus the half-space and the body within it. A face the plane
          // crosses is modified in both, into one piece per side.
          const outside = this.#withHistory(
            inputHashes,
            this.#occt.cutWithHistory(target, half, inputHashes, HASH_UPPER_BOUND),
          );
          const inside = this.#withHistory(
            inputHashes,
            this.#occt.intersectWithHistory(target, half, inputHashes, HASH_UPPER_BOUND),
          );
          const pieces = [outside.shape, inside.shape].map((shape) => this.#resolve(shape));
          if (pieces.some((piece) => this.#faceHashes(piece).length === 0)) {
            void this.dispose(outside.shape);
            void this.dispose(inside.shape);
            throw new Error('The plane does not pass through the body.');
          }
          const whole = this.#track(this.#occt.makeCompound(pieces));
          const evolution = bothSides(outside.evolution, inside.evolution);
          void this.dispose(outside.shape);
          void this.dispose(inside.shape);
          return { shape: whole, evolution };
        } finally {
          this.#occt.release(half);
        }
      }),
    );
  }

  async moveParts(
    solid: ShapeId,
    parts: readonly ShapeId[],
    motion: PartMotion,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return attempt('invalid-result', 'This face or edge could not be moved.', () => {
      const shape = this.#resolve(solid);
      const hashes = this.#faceHashes(shape);
      const targets = parts.map((part) => this.#resolve(part));
      return this.#withHistory(
        hashes,
        tweakParts(this.#occt, shape, targets, motion, hashes, HASH_UPPER_BOUND),
      );
    });
  }

  async offsetFaces(
    solid: ShapeId,
    faces: readonly ShapeId[],
    distance: number,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return attempt('invalid-result', 'These faces could not be pushed out.', () => {
      const shape = this.#resolve(solid);
      const hashes = this.#faceHashes(shape);
      const targets = faces.map(this.#resolve, this);
      const moved = offsetFaces(this.#occt, shape, targets, distance, hashes, HASH_UPPER_BOUND);
      return this.#withHistory(hashes, moved);
    });
  }

  scale(
    solid: ShapeId,
    center: Vec3,
    factor: number | Vec3,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return Promise.resolve(
      attempt('invalid-result', 'This body could not be scaled.', () => {
        const by = typeof factor === 'number' ? { x: factor, y: factor, z: factor } : factor;
        if (![by.x, by.y, by.z].every((f) => f > 0 && Number.isFinite(f))) {
          throw new Error('A scale factor has to be a positive number.');
        }
        const shape = this.#resolve(solid);
        const inputHashes = this.#faceHashes(shape);
        if (by.x === by.y && by.y === by.z)
          return this.#withHistory(
            inputHashes,
            this.#occt.scaleWithHistory(shape, center, by.x, inputHashes, HASH_UPPER_BOUND),
          );
        const scaled = this.#occt.generalTransform(shape, stretchAbout(center, by));
        return {
          shape: this.#track(scaled),
          evolution: sameFaces(inputHashes, this.#faceHashes(scaled)),
        };
      }),
    );
  }

  mirror(solid: ShapeId, point: Vec3, normal: Vec3): Promise<KernelResult<ShapeWithHistory>> {
    return Promise.resolve(
      attempt('invalid-result', 'This body could not be mirrored.', () => {
        if (Math.hypot(normal.x, normal.y, normal.z) < 1e-9) {
          throw new Error('A mirror plane needs a direction.');
        }
        const shape = this.#resolve(solid);
        const inputHashes = this.#faceHashes(shape);
        return this.#withHistory(
          inputHashes,
          this.#occt.mirrorWithHistory(shape, point, normal, inputHashes, HASH_UPPER_BOUND),
        );
      }),
    );
  }

  // Modifying solids.

  async fillet(
    solid: ShapeId,
    edges: readonly ShapeId[],
    radius: number,
  ): Promise<KernelResult<ShapeWithHistory>> {
    // Most likely to fail on real geometry; a radius that does not fit is common.
    return attempt(
      'radius-too-large',
      `A ${radius} mm round does not fit on this edge. Try a smaller radius.`,
      () =>
        // A round larger than the faces beside it takes them over (`overflow-round.ts`).
        this.#byPart(solid, edges, (part, on, hashes) =>
          roundOrOverflow(this.#occt, part, on, radius, hashes, HASH_UPPER_BOUND),
        ),
    );
  }

  async removeFaces(
    solid: ShapeId,
    faces: readonly ShapeId[],
  ): Promise<KernelResult<ShapeWithHistory>> {
    return attempt(
      'invalid-result',
      'The faces around these cannot close the gap they leave.',
      () => {
        const done = this.#byPart(solid, faces, (part, on, hashes) =>
          this.#occt.defeatureWithHistory(part, on, hashes, HASH_UPPER_BOUND),
        );
        // OCCT answers a gap it cannot close (the top of a box) with the solid unchanged.
        if (done.evolution.deleted.length > 0) return done;
        void this.dispose(done.shape);
        throw new Error('nothing was removed');
      },
    );
  }

  async chamfer(
    solid: ShapeId,
    edges: readonly ShapeId[],
    distance: number,
    other?: number,
  ): Promise<KernelResult<ShapeWithHistory>> {
    const two = other !== undefined && Math.abs(other - distance) > 1e-9;
    return attempt(
      'radius-too-large',
      `A ${distance} mm bevel does not fit on this edge. Try a smaller distance.`,
      () =>
        this.#byPart(solid, edges, (part, on, hashes) =>
          two
            ? this.#occt.chamferTwoWithHistory(part, on, distance, other, hashes, HASH_UPPER_BOUND)
            : this.#occt.chamferWithHistory(part, on, distance, hashes, HASH_UPPER_BOUND),
        ),
    );
  }

  /** A round or bevel on each part an edge is on, the rest kept (`edge-parts.ts`). */
  #byPart(
    solid: ShapeId,
    edges: readonly ShapeId[],
    treat: (part: RawHandle, on: RawHandle[], hashes: FaceHash[]) => RawEvolution,
  ): ShapeWithHistory {
    const target = this.#resolve(solid);
    const handles = edges.map((e) => this.#resolve(e));
    const once = (part: RawHandle, on: RawHandle[], hashes: FaceHash[]) =>
      this.#withHistory(hashes, treat(part, on, hashes));
    if (this.#occt.isSolid(target)) return once(target, handles, this.#faceHashes(target));
    const joined = joinByPart(
      this.#occt,
      target,
      handles,
      (shape) => this.#faceHashes(shape),
      (part, on, hashes) => {
        const done = once(part, on, hashes);
        const shape = this.#resolve(done.shape);
        return { shape, evolution: done.evolution, done: () => void this.dispose(done.shape) };
      },
    );
    return { shape: this.#track(joined.shape), evolution: joined.evolution };
  }

  async shell(
    solid: ShapeId,
    facesToRemove: readonly ShapeId[],
    thickness: number,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return attempt(
      'self-intersection',
      `Hollowing this shape to ${thickness} mm walls failed — the walls would ` +
        'run into each other. Try a thinner wall.',
      () => {
        const target = this.#resolve(solid);
        const inputHashes = this.#faceHashes(target);
        return this.#withHistory(
          inputHashes,
          this.#occt.shellWithHistory(
            target,
            facesToRemove.map((f) => this.#resolve(f)),
            thickness,
            1e-3,
            inputHashes,
            HASH_UPPER_BOUND,
          ),
        );
      },
    );
  }

  // Reading geometry back.

  async subShapes(
    shape: ShapeId,
    type: 'face' | 'edge' | 'vertex',
  ): Promise<KernelResult<readonly ShapeId[]>> {
    return attempt('invalid-result', `The ${type}s of this shape could not be read.`, () =>
      this.#occt.getSubShapes(this.#resolve(shape), type).map((h) => this.#track(h)),
    );
  }

  async describeFaces(shape: ShapeId): Promise<KernelResult<readonly FaceDescription[]>> {
    return attempt('invalid-result', 'The faces of this shape could not be read.', () => {
      const handle = this.#resolve(shape);
      // Per solid, reusing unchanged solids' faces: redescribing a 108,000-face assembly took 0.8 s
      // and as many new handles per edit.
      const pieces = perSolid(
        this.#occt,
        handle,
        'face',
        this.#faces,
        (hash) => `${hash}|faces`,
        (solid) => {
          const faces = this.#describe(solid);
          for (const face of faces) this.#pinned.add(face.id);
          return faces;
        },
        undefined,
        true,
      );
      return pieces === null ? this.#describe(handle) : pieces.flat();
    });
  }

  /** Every face of one shape, with a handle each. */
  #describe(handle: RawHandle): FaceDescription[] {
    // The cheap half only; area and centroid are about 94% of the cost and fetched separately.
    return this.#occt.getSubShapes(handle, 'face').map((face) => ({
      id: this.#track(face),
      hash: this.#occt.hashCode(face, HASH_UPPER_BOUND) as FaceHash,
      surfaceType: String(this.#occt.surfaceType(face)),
    }));
  }

  async faceHashes(shape: ShapeId): Promise<KernelResult<readonly FaceHash[]>> {
    // `subShapeHashes` walks faces in the order `getSubShapes` does, which is the order
    // `describeFaces` reports, so the two line up by position.
    return attempt('invalid-result', 'The faces of this shape could not be read.', () =>
      this.#faceHashes(this.#resolve(shape)),
    );
  }

  async measureFaces(faces: readonly ShapeId[]): Promise<KernelResult<readonly FaceMeasurement[]>> {
    return attempt('invalid-result', 'These faces could not be measured.', () =>
      faces.map((face) => {
        const handle = this.#resolve(face);
        return {
          area: this.#occt.getSurfaceArea(handle),
          centre: this.#occt.getSurfaceCenterOfMass(handle),
        };
      }),
    );
  }

  async massProperties(shape: ShapeId): Promise<KernelResult<MassProperties>> {
    return attempt('invalid-result', 'This body could not be measured.', () => {
      const handle = this.#resolve(shape);
      const volume = Math.abs(this.#occt.getVolume(handle));
      const centre = this.#occt.getCenterOfMass(handle);
      return { volume, area: this.#occt.getSurfaceArea(handle), centre };
    });
  }

  async bounds(shape: ShapeId): Promise<KernelResult<Bounds>> {
    return attempt('invalid-result', 'The extents of this shape could not be read.', () =>
      boundsOf(this.#occt, this.#resolve(shape), this.#alive),
    );
  }

  async sharedEdge(faceA: ShapeId, faceB: ShapeId): Promise<KernelResult<ShapeId | null>> {
    return attempt('invalid-result', 'These two faces do not meet along an edge.', () => {
      const edges = this.#occt.sharedEdges(this.#resolve(faceA), this.#resolve(faceB));
      // Exactly one, or the reference is ambiguous: two faces can meet along two seams (a cylinder
      // split lengthwise), and guessing puts a fillet on the wrong edge.
      return edges.length === 1 && edges[0] !== undefined ? this.#track(edges[0]) : null;
    });
  }
  async sharedVertex(faces: readonly ShapeId[]): Promise<KernelResult<ShapeId | null>> {
    return attempt('invalid-result', 'These faces do not meet at one corner.', () => {
      const corner = vertexWhereFacesMeet(this.#occt, faces.map(this.#resolve, this));
      return corner === null ? null : this.#track(corner);
    });
  }
  async faceCylinder(face: ShapeId): Promise<KernelResult<CylindricalFace | null>> {
    return attempt('invalid-result', 'This face could not be classified.', () =>
      describeCylinder(this.#occt, this.#resolve(face)),
    );
  }
  async resizeCylinder(
    solid: ShapeId,
    face: ShapeId,
    radius: number,
  ): Promise<KernelResult<ShapeWithHistory>> {
    return attempt(
      'invalid-result',
      'This radius does not fit this cylindrical wall. Try a smaller change.',
      () => {
        const body = this.#resolve(solid),
          hashes = this.#faceHashes(body);
        return this.#withHistory(
          hashes,
          resizeCylinder(this.#occt, body, this.#resolve(face), radius, hashes, HASH_UPPER_BOUND),
        );
      },
    );
  }

  facePlane(face: ShapeId): Promise<KernelResult<{ origin: Vec3; normal: Vec3 }>> {
    return Promise.resolve(
      attempt('invalid-result', 'Only a flat face can be sketched on.', () =>
        planeOfFace(this.#occt, this.#resolve(face)),
      ),
    );
  }

  // Drawing (`occt-display.ts`).

  tessellate: GeometryKernel['tessellate'] = (shape, options) =>
    this.#display.tessellate(shape, options);
  tessellateSolids: GeometryKernel['tessellateSolids'] = (shape, solids, options) =>
    this.#display.tessellateSolids(shape, solids, options);
  extractSolidEdges: GeometryKernel['extractSolidEdges'] = (shape, solids, options) =>
    this.#display.extractSolidEdges(shape, solids, options);
  extractEdges: GeometryKernel['extractEdges'] = (shape, options) =>
    this.#display.extractEdges(shape, options);
  splitForMeshing: GeometryKernel['splitForMeshing'] = (shape, count) =>
    this.#display.splitForMeshing(shape, count);
  meshPacket: GeometryKernel['meshPacket'] = (brep, options) =>
    this.#display.meshPacket(brep, options);
  adoptMeshes: GeometryKernel['adoptMeshes'] = (shape, packet, options) =>
    this.#display.adoptMeshes(shape, packet, options);

  // Files.

  async sectionDrawing(shape: ShapeId, fraction: number): Promise<KernelResult<DrawingProjection>> {
    return attempt('invalid-result', 'The section could not be computed.', () =>
      sectionBrep(this.#occt, this.#resolve(shape), fraction),
    );
  }

  async sectionByPlane(
    shape: ShapeId,
    plane: { origin: Vec3; normal: Vec3; xDirection: Vec3 },
  ): Promise<KernelResult<number[][]>> {
    return attempt('invalid-result', 'The part could not be cut by the sketch plane.', () =>
      sectionByPlaneBrep(this.#occt, this.#resolve(shape), plane),
    );
  }

  async projectDrawing(
    shape: ShapeId,
    direction: DrawingDirection,
  ): Promise<KernelResult<DrawingProjection>> {
    return attempt('invalid-result', 'The drawing projection could not be built.', () =>
      projectBrep(this.#occt, this.#resolve(shape), direction),
    );
  }

  // Files (`occt-files.ts`).

  exportStep: GeometryKernel['exportStep'] = (shape) => this.#files.exportStep(shape);
  exportStepFile: GeometryKernel['exportStepFile'] = (shape, parts) =>
    this.#files.exportStepFile(shape, parts);
  exportStl: GeometryKernel['exportStl'] = (shape, options) =>
    this.#files.exportStl(shape, options);
  importStep: GeometryKernel['importStep'] = (data, options) =>
    this.#files.importStep(data, options);
  importIges: GeometryKernel['importIges'] = (data) => this.#files.importIges(data);
  flatOutlines: GeometryKernel['flatOutlines'] = (shape) => this.#files.flatOutlines(shape);
  importColours: GeometryKernel['importColours'] = (key, data) =>
    this.#files.importColours(key, data);

  importNames: GeometryKernel['importNames'] = (key, data) => this.#files.importNames(key, data);
  importKept: GeometryKernel['importKept'] = (key) => this.#files.importKept(key);

  // Memory.

  async dispose(shape: ShapeId): Promise<void> {
    // A face handed out from the description cache belongs to the cache.
    if (this.#pinned.has(shape)) return;
    const handle = this.#shapes.get(shape);
    if (handle === undefined) return;
    this.#shapes.delete(shape);
    this.#occt.release(handle);
  }

  async liveShapeCount(): Promise<number> {
    return this.#shapes.size;
  }

  flushStore(): Promise<void> {
    return this.#display.flush();
  }
}

/** Build a kernel bound to a freshly loaded OCCT module. */
export async function createOcctKernel(
  options: OcctLoadOptions & {
    store?: ShapeStore;
    alive?: (budgetMs?: number) => void;
    stream?: (piece: MeshPiece) => void;
  } = {},
): Promise<GeometryKernel> {
  const occt = await loadOcct(options);
  return new OcctGeometryKernel(occt, options.store, options.alive, options.stream);
}

export type { OcctLoadOptions } from './wasm.js';
export { loadOcct, resetOcctForTesting } from './wasm.js';
