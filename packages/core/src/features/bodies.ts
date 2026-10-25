/**
 * Shared helpers for multi-body features. A document's body is one shape holding each part as its
 * own solid (ADR 0012); these add parts, select owning parts and reassemble without renaming
 * untouched parts.
 */

import type {
  EvolutionData,
  GeometryKernel,
  KernelResult,
  Profile,
  ShapeId,
  ShapeWithHistory,
  Vec3,
} from '@bezier/kernel';
import { err } from '@bezier/kernel';
import { formatRef, type StableRef } from '../stable-ref.js';
import type { RebuildInput, RebuildOutput } from './registry.js';

export type BodyOperation = 'new' | 'add' | 'cut';

/**
 * Depth a "through all" cut from the plane at `origin` along `normal` must reach, with margin.
 * Measured on the body at this point in the history.
 */
export async function depthThrough(
  kernel: GeometryKernel,
  body: ShapeId,
  origin: Vec3,
  normal: Vec3,
): Promise<KernelResult<number>> {
  const bounds = await kernel.bounds(body);
  if (!bounds.ok) return bounds;
  const { min, max } = bounds.value;
  const length = Math.hypot(normal.x, normal.y, normal.z) || 1;
  let deepest = 0;
  for (const x of [min.x, max.x])
    for (const y of [min.y, max.y])
      for (const z of [min.z, max.z]) {
        const along =
          ((x - origin.x) * normal.x + (y - origin.y) * normal.y + (z - origin.z) * normal.z) /
          length;
        deepest = Math.max(deepest, Math.abs(along));
      }
  // Overshoot so no skin of material is left.
  return { ok: true, value: deepest + Math.max(1, deepest * 0.01) };
}

/**
 * Combines a new solid with the existing body. "New" adds a separate part; "add" and "cut" affect
 * only the parts the tool touches, since OCCT leaves other solids in a compound alone
 * (`packages/kernel/src/multi-body.test.ts`).
 */
export async function combineWithBody(
  kernel: GeometryKernel,
  body: ShapeId | null,
  created: ShapeId,
  operation: BodyOperation,
  merge = false,
): Promise<KernelResult<RebuildOutput>> {
  // First part: every face is new.
  if (body === null) return { ok: true, value: { body: created, evolution: null } };

  const combined =
    operation === 'new'
      ? await kernel.compound(body, created)
      : operation === 'add'
        ? await kernel.fuse(body, created, { merge })
        : await kernel.cut(body, created);

  // The new solid is an intermediate either way.
  await kernel.dispose(created);
  if (!combined.ok) return combined;
  return { ok: true, value: { body: combined.value.shape, evolution: combined.value.evolution } };
}

/**
 * Builds one solid per sketch region and fuses them; touching regions become one part. No
 * history: everything is new geometry.
 */
export async function buildFromAreas(
  kernel: GeometryKernel,
  profiles: readonly Profile[],
  make: (profile: Profile) => Promise<KernelResult<ShapeId>>,
): Promise<KernelResult<ShapeId>> {
  let whole: ShapeId | null = null;
  for (const profile of profiles) {
    const made = await make(profile);
    if (!made.ok) {
      if (whole !== null) await kernel.dispose(whole);
      return made;
    }
    if (whole === null) {
      whole = made.value;
      continue;
    }
    const joined: KernelResult<ShapeWithHistory> = await kernel.fuse(whole, made.value);
    await kernel.dispose(whole);
    await kernel.dispose(made.value);
    if (!joined.ok) return joined;
    whole = joined.value.shape;
  }
  if (whole === null) return err('open-profile', 'There is no closed area to build from.');
  return { ok: true, value: whole };
}

/**
 * Resolves face references or reports which are gone. `what` names the selection in the message
 * (e.g. "bodies to remove").
 */
export async function resolveFaces(
  input: RebuildInput,
  refs: readonly StableRef[],
  what: string,
): Promise<KernelResult<ShapeId[]>> {
  if (refs.length === 0) return err('invalid-result', `Select the ${what}.`);
  const handles: ShapeId[] = [];
  const lost: string[] = [];
  for (const ref of refs) {
    const handle = await input.resolve(ref);
    if (handle === null) lost.push(formatRef(ref));
    else handles.push(handle);
  }
  if (lost.length > 0) {
    return err(
      'invalid-result',
      lost.length === refs.length
        ? `The ${what} no longer exist. Pick them again.`
        : `${lost.length} of the ${what} no longer exist. Pick them again.`,
      lost.join(', '),
    );
  }
  return { ok: true, value: handles };
}

/**
 * Puts a changed part back beside the untouched ones, merging evolution so the untouched parts
 * keep their names.
 */
export async function reassemble(
  kernel: GeometryKernel,
  rest: ShapeId,
  changed: ShapeWithHistory,
): Promise<KernelResult<ShapeWithHistory>> {
  const combined = await kernel.compound(rest, changed.shape);
  if (!combined.ok) return combined;
  const evolution: EvolutionData = {
    unchanged: [...combined.value.evolution.unchanged, ...changed.evolution.unchanged],
    generated: changed.evolution.generated,
    modified: changed.evolution.modified,
    deleted: changed.evolution.deleted,
  };
  return { ok: true, value: { shape: combined.value.shape, evolution } };
}

/**
 * One adjacent face per edge or vertex, to find its owning part for `withinOwningSolids`.
 * Unresolvable references are skipped; the caller reports them.
 */
export async function facesBeside(
  input: RebuildInput,
  edges: readonly StableRef[],
): Promise<ShapeId[]> {
  const faces: ShapeId[] = [];
  for (const edge of edges) {
    if (edge.kind === 'face') continue;
    const [first] = edge.faces;
    if (first === undefined) continue;
    const face = await input.resolve(first);
    if (face !== null) faces.push(face);
  }
  return faces;
}

/**
 * Runs an operation on only the parts owning the given faces, for operations OCCT refuses on a
 * multi-solid compound (e.g. shell, see the kernel's multi-body test). A single-part body is
 * passed through unchanged.
 */
export async function withinOwningSolids(
  kernel: GeometryKernel,
  body: ShapeId,
  faces: readonly ShapeId[],
  operation: (solids: ShapeId) => Promise<KernelResult<ShapeWithHistory>>,
): Promise<KernelResult<RebuildOutput>> {
  const parts = await kernel.partition(body, faces);
  if (!parts.ok) return parts;
  const { selected, remainder } = parts.value;
  let changed: ShapeId | null = null;
  try {
    const result = await operation(remainder === null ? body : selected);
    if (!result.ok) return result;
    if (remainder === null) {
      return { ok: true, value: { body: result.value.shape, evolution: result.value.evolution } };
    }
    changed = result.value.shape;
    const whole = await reassemble(kernel, remainder, result.value);
    if (!whole.ok) return whole;
    return { ok: true, value: { body: whole.value.shape, evolution: whole.value.evolution } };
  } finally {
    if (changed !== null) await kernel.dispose(changed);
    await kernel.dispose(selected);
    if (remainder !== null) await kernel.dispose(remainder);
  }
}
