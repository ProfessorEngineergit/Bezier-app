/**
 * Replays a document's feature history into geometry. A failed feature does not stop the others
 * (per-feature statuses), and face naming is threaded through every operation (naming.ts).
 */

import type { Bounds, EdgeSet, GeometryKernel, Profile, ShapeId } from '@bezier/kernel';
import type { ConstraintSolver, Sketch, SolveResult } from '@bezier/solver';
import type { CadDocument, RebuildResult } from '../document.js';
import { evaluateVariables, lookupIn } from '../expressions.js';
import { cacheKey, getFeature, type ParamsSpec, readParams } from '../features/index.js';
import type { FeatureId, FeatureRecord, FeatureStatus } from '../features/types.js';
import { formatRef, type StableRef } from '../stable-ref.js';
import { fingerprint, type RebuildCache } from './cache.js';
import { type TessellationChoice, tessellationFor } from './detail.js';
import { evaluateParams } from './evaluate-params.js';
import { FaceNaming } from './naming.js';
import { faceSketchBasis, leanedBasis, leanOf, type PlaneBasis, planeBasis } from './plane.js';
import { type SketchProfile, sketchProfiles } from './profile.js';
import type { SketchRegion } from './regions.js';
import { sketchPath } from './sketch-path.js';

/** Time limit per feature before the rebuild gives up on it (ADR 0009). */
const FEATURE_DEADLINE_MS = 30_000;

export interface RebuildDeps {
  kernel: GeometryKernel;
  solver: ConstraintSolver;
  /** Reuses feature outputs across rebuilds. Optional; results must not depend on it. */
  cache?: RebuildCache;
  /**
   * Display tessellation setting; not stored in the document. Omitted means the kernel default.
   * See detail.ts for the face-count rule.
   */
  tessellation?: TessellationChoice;
  /**
   * False to skip tessellation when the caller only needs statuses (`Session.tryApply`). On large
   * assemblies the display is most of a rebuild.
   */
  display?: boolean;
  /**
   * Receives an outline of slow work in progress (`RebuildInput.preview`). The box comes from the
   * outline's points, since exact extents of an unmeshed assembly can take a minute.
   */
  onPreview?: (outline: { edges: EdgeSet; box: Bounds }) => void;
}

/**
 * Replays a document into geometry. Never throws for a modelling problem: a failed or dangling
 * feature is recorded in `statuses` and replay continues with the last good body.
 */
export async function rebuild(
  document: CadDocument,
  { kernel, solver, cache, tessellation, display: triangulate = true, onPreview }: RebuildDeps,
): Promise<RebuildResult> {
  const startedAt = Date.now();
  const statuses = new Map<FeatureId, FeatureStatus>();
  const naming = new FaceNaming();
  /** Solved sketches with their plane and regions. */
  const sketches = new Map<FeatureId, SolvedSketchEntry>();

  /** The current body; null until a feature creates geometry. */
  let body: ShapeId | null = null;
  /** Features that did not build. Only their dependents are skipped. */
  const broken = new Map<FeatureId, string>();
  /** Rolling hash of everything applied so far, so an edit invalidates exactly its downstream. */
  let upstreamKey = 'root';
  /**
   * Bodies created this pass, released at the end except the final body and cache-owned ones.
   * Kernel memory is outside the JS heap and is not garbage-collected.
   */
  const created: ShapeId[] = [];
  const ownedByCache = new Set<ShapeId>();
  const variables = lookupIn(evaluateVariables(document.meta.variables ?? []));

  for (const record of document.features) {
    if (record.suppressed === true) {
      statuses.set(record.id, { state: 'suppressed' });
      continue;
    }

    const definition = getFeature(record.type);
    if (definition === undefined) {
      // Unknown feature type: forward compatibility, not corruption (ADR 0008).
      statuses.set(record.id, {
        state: 'unknown-type',
        message: `This version does not know the feature "${record.type}".`,
      });
      broken.set(record.id, record.name);
      continue;
    }

    const evaluated = evaluateParams(definition.params, record, variables);
    if (!evaluated.ok) {
      statuses.set(record.id, { state: 'failed', message: evaluated.message });
      broken.set(record.id, record.name);
      continue;
    }
    const params = readParams(record.type, evaluated.params);
    if (!params.ok) {
      statuses.set(record.id, { state: 'failed', message: params.message });
      broken.set(record.id, record.name);
      continue;
    }

    const cause = brokenDependency(definition.params, params.params, broken);
    if (cause !== null) {
      statuses.set(record.id, {
        state: 'blocked',
        message: `Skipped because ${cause} could not be built.`,
      });
      broken.set(record.id, record.name);
      continue;
    }

    // Sketches are solved here, which keeps the solver out of feature definitions.
    if (record.type === 'sketch') {
      const basis = await sketchBasis(kernel, naming, params.params);
      if (!basis.ok) {
        statuses.set(record.id, basis.status);
        broken.set(record.id, record.name);
        continue;
      }
      const solved = solveSketch(solver, record, params.params, basis.basis);
      if (!solved.ok) {
        statuses.set(record.id, { state: 'failed', message: solved.message });
        broken.set(record.id, record.name);
        continue;
      }
      sketches.set(record.id, {
        basis: basis.basis,
        profiles: solved.profiles,
        regions: solved.regions,
        path: solved.path,
      });
      upstreamKey = fingerprint(
        cacheKey(record.type, params.params, `${upstreamKey}|${record.id}`),
      );
      statuses.set(record.id, { state: 'ok' });
      continue;
    }

    // Cached naming contains feature IDs, so the key includes the record id.
    const key = fingerprint(cacheKey(record.type, params.params, `${upstreamKey}|${record.id}`));
    upstreamKey = key;

    const cached = cache?.get(key);
    if (cached !== undefined) {
      // Cache hit: skip the kernel.
      body = cached.body;
      ownedByCache.add(cached.body);
      naming.restore(cached.naming);
      statuses.set(record.id, { state: 'ok' });
      continue;
    }

    const lostRefs: string[] = [];
    const outcome: Awaited<ReturnType<typeof definition.rebuild>> | 'timeout' = await withDeadline(
      definition.rebuild(kernel, params.params as never, {
        body,
        resolve: async (ref: StableRef) => {
          const handle = await naming.resolve(kernel, ref);
          if (handle === null) lostRefs.push(formatRef(ref));
          return handle;
        },
        profiles: (id: FeatureId, regions?: readonly string[]) => {
          const entry = sketches.get(id);
          if (entry === undefined) return null;
          if (regions === undefined || regions.length === 0) {
            return entry.profiles.map((item) => item.profile);
          }
          return entry.profiles
            .filter((item) => regions.includes(item.key))
            .map((item) => item.profile);
        },
        sketchPlane: (id: FeatureId) => sketches.get(id)?.basis ?? null,
        path: (id: FeatureId) => sketches.get(id)?.path() ?? null,
        ...(onPreview === undefined ? {} : { preview: previewer(kernel, onPreview, tessellation) }),
      }),
      definition.deadlineMs?.(params.params as never) ?? FEATURE_DEADLINE_MS,
    );

    if (outcome === 'timeout') {
      statuses.set(record.id, {
        state: 'failed',
        message: 'This feature took too long and was stopped.',
      });
      broken.set(record.id, record.name);
      continue;
    }

    if (!outcome.ok) {
      statuses.set(
        record.id,
        lostRefs.length > 0
          ? { state: 'dangling', message: outcome.error.message, lostRefs }
          : { state: 'failed', message: outcome.error.message },
      );
      broken.set(record.id, record.name);
      continue;
    }

    if (outcome.value.cleared === true) {
      // The last part was removed; later features start from empty.
      body = null;
      naming.clear();
      statuses.set(record.id, { state: 'ok' });
      continue;
    }

    const next: ShapeId | null = outcome.value.body;
    if (next === null) {
      statuses.set(record.id, { state: 'ok' });
      continue;
    }
    // A feature that leaves the solid unchanged (a picture, a reference mesh) must keep its names
    // (audit F-039).
    if (next === body) {
      statuses.set(record.id, { state: 'ok' });
      continue;
    }

    // Re-describe the body and carry names forward (naming.ts).
    const faces = await kernel.describeFaces(next);
    if (!faces.ok) {
      statuses.set(record.id, { state: 'failed', message: faces.error.message });
      broken.set(record.id, record.name);
      continue;
    }

    const inOrder = definition.namesInOrder?.(params.params as never) === true;
    if (outcome.value.evolution === null) {
      await naming.seed(kernel, record.id, next, faces.value, definition.faceTags, inOrder);
    } else {
      await naming.advance(
        kernel,
        record.id,
        next,
        outcome.value.evolution,
        faces.value,
        definition.faceTags,
        inOrder,
      );
    }

    body = next;
    created.push(next);
    if (cache !== undefined) {
      await cache.set(key, { body: next, naming: naming.snapshot() }, kernel);
      ownedByCache.add(next);
    }
    statuses.set(record.id, { state: 'ok' });
  }

  const display =
    body === null || !triangulate ? null : await tessellate(kernel, body, tessellation);

  // Release intermediates; the cache disposes its own on eviction.
  for (const shape of created) {
    if (shape !== body && !ownedByCache.has(shape)) await kernel.dispose(shape);
  }

  return {
    statuses,
    mesh: display?.mesh ?? null,
    edges: display?.edges ?? null,
    body,
    naming,
    sketches,
    durationMs: Date.now() - startedAt,
  };
}

interface SolvedSketchEntry {
  basis: PlaneBasis;
  profiles: readonly SketchProfile[];
  regions: readonly SketchRegion[];
  /** The curves as one sweep path (`sketch-path.ts`), or why they are not one. */
  path: () => Profile | string;
}

type SketchBasis =
  | { ok: true; basis: PlaneBasis }
  | { ok: false; status: Exclude<FeatureStatus, { state: 'ok' | 'suppressed' }> };

/**
 * The sketch's plane: an origin plane or a flat face. A face sketch follows its face on every
 * rebuild.
 */
async function sketchBasis(
  kernel: GeometryKernel,
  naming: FaceNaming,
  params: Record<string, unknown>,
): Promise<SketchBasis> {
  const resting = await restOf(kernel, naming, params);
  return resting.ok ? { ok: true, basis: leanedBasis(resting.basis, leanOf(params)) } : resting;
}

/** The plane or face a sketch stands on, before any offset. */
async function restOf(
  kernel: GeometryKernel,
  naming: FaceNaming,
  params: Record<string, unknown>,
): Promise<SketchBasis> {
  const faces = params.face;
  const [ref] = Array.isArray(faces) ? (faces as readonly StableRef[]) : [];
  if (ref === undefined) {
    const named = planeBasis(typeof params.plane === 'string' ? params.plane : 'XY');
    return named === null
      ? { ok: false, status: { state: 'failed', message: 'This sketch is on an unknown plane.' } }
      : { ok: true, basis: named };
  }
  const face = await naming.resolve(kernel, ref);
  if (face === null) {
    return {
      ok: false,
      status: {
        state: 'dangling',
        message: 'The face this sketch was drawn on no longer exists.',
        lostRefs: [formatRef(ref)],
      },
    };
  }
  const plane = await kernel.facePlane(face);
  if (!plane.ok) return { ok: false, status: { state: 'failed', message: plane.error.message } };
  return { ok: true, basis: faceSketchBasis(plane.value.origin, plane.value.normal) };
}

/**
 * Name of a broken feature this one depends on, or null. Dependencies are read from the param
 * schema (feature refs and geometry refs), so no feature type is special-cased (ADR 0008).
 */
function brokenDependency(
  spec: ParamsSpec,
  params: Record<string, unknown>,
  broken: ReadonlyMap<FeatureId, string>,
): string | null {
  if (broken.size === 0) return null;
  for (const [key, entry] of Object.entries(spec)) {
    const value = params[key];
    if (entry.kind === 'featureRef' && typeof value === 'string') {
      const name = broken.get(value);
      if (name !== undefined) return name;
    }
    if (entry.kind === 'geometryRefs' && Array.isArray(value)) {
      for (const ref of value as readonly StableRef[]) {
        for (const feature of featuresOf(ref)) {
          const name = broken.get(feature);
          if (name !== undefined) return name;
        }
      }
    }
  }
  return null;
}

function featuresOf(ref: StableRef): readonly FeatureId[] {
  if (ref.kind === 'face') return [ref.feature];
  return ref.faces.map((face) => face.feature);
}

async function tessellate(
  kernel: GeometryKernel,
  body: ShapeId,
  choice: TessellationChoice | undefined,
) {
  const options = await tessellationFor(kernel, body, choice);
  // Edges at the same setting as the surfaces, so precomputed display data is reused.
  const [mesh, edges] = await Promise.all(
    options === undefined
      ? [kernel.tessellate(body), kernel.extractEdges(body)]
      : [kernel.tessellate(body, options), kernel.extractEdges(body, options)],
  );
  return {
    mesh: mesh.ok ? mesh.value : null,
    edges: edges.ok ? edges.value : null,
  };
}

/** Outlines a shape and passes it on with the box its points span. */
function previewer(
  kernel: GeometryKernel,
  show: NonNullable<RebuildDeps['onPreview']>,
  choice: TessellationChoice | undefined,
): (shape: ShapeId) => Promise<void> {
  return async (shape) => {
    // Same setting as the final display, so kept outlines are reused (kernel `kept-displays.ts`).
    const options = await tessellationFor(kernel, shape, choice);
    const edges =
      options === undefined
        ? await kernel.extractEdges(shape)
        : await kernel.extractEdges(shape, options);
    if (!edges.ok || edges.value.positions.length < 3) return;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    const points = edges.value.positions;
    for (let i = 0; i + 2 < points.length; i += 3) {
      const x = points[i] ?? 0;
      const y = points[i + 1] ?? 0;
      const z = points[i + 2] ?? 0;
      if (x < min.x) min.x = x;
      if (y < min.y) min.y = y;
      if (z < min.z) min.z = z;
      if (x > max.x) max.x = x;
      if (y > max.y) max.y = y;
      if (z > max.z) max.z = z;
    }
    show({ edges: edges.value, box: { min, max } });
  };
}

/**
 * Stops waiting for an operation after `ms`. OCCT can hang on pathological geometry (ADR 0009);
 * this does not stop the kernel, the worker supervisor does.
 */
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

type SolvedSketch =
  | {
      ok: true;
      profiles: readonly SketchProfile[];
      regions: readonly SketchRegion[];
      path: () => Profile | string;
    }
  | { ok: false; message: string };

function solveSketch(
  solver: ConstraintSolver,
  record: FeatureRecord,
  params: Record<string, unknown>,
  basis: PlaneBasis,
): SolvedSketch {
  const sketch = params.sketch as Sketch | undefined;
  if (sketch === undefined) {
    return { ok: false, message: `${record.name} has no geometry.` };
  }

  // planegcs throws on malformed sketches (duplicate ids, dangling refs); report as a failure.
  let solved: SolveResult;
  try {
    solved = solver.solve(sketch);
  } catch (error) {
    // The user gets a message; the console gets the original error.
    console.error(`${record.name} (${record.id}) could not be read by the solver.`, error);
    return { ok: false, message: 'This sketch has references the solver cannot read.' };
  }
  if (solved.status === 'failed') {
    return { ok: false, message: 'This sketch could not be solved.' };
  }
  if (solved.status === 'conflicting') {
    return {
      ok: false,
      message: `${solved.conflicting.length} constraints in this sketch contradict each other.`,
    };
  }

  const built = sketchProfiles(sketch, solved, basis);
  // An open sketch is valid; it just has no region yet. Failing it would break Finish Sketch.
  return built.ok
    ? {
        ok: true,
        profiles: built.profiles,
        regions: built.regions,
        path: () => sketchPath(sketch, solved, basis),
      }
    : { ok: false, message: built.message };
}
