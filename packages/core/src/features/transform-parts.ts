/** Transform the owning solids, preserving untouched bodies and stable references. */
import {
  err,
  type GeometryKernel,
  type KernelResult,
  type ShapeId,
  type ShapeWithHistory,
} from '@bezier/kernel';
import type { StableRef } from '../stable-ref.js';
import type { RebuildInput, RebuildOutput } from './registry.js';

export async function unchangedBody(
  kernel: GeometryKernel,
  body: ShapeId,
): Promise<KernelResult<RebuildOutput>> {
  // Hashes only; describing faces costs a handle per face (108,000 on a large assembly).
  const faces = await kernel.faceHashes(body);
  if (!faces.ok) return faces;
  const unchanged = [...faces.value];
  return {
    ok: true,
    value: { body, evolution: { unchanged, generated: [], modified: [], deleted: [] } },
  };
}

export async function transformParts(
  kernel: GeometryKernel,
  input: RebuildInput,
  faces: readonly StableRef[],
  transform: (body: ShapeId) => Promise<KernelResult<ShapeWithHistory>>,
  copy = false,
): Promise<KernelResult<RebuildOutput>> {
  if (!input.body) return err('invalid-result', 'Select a body to transform.');
  let selected = input.body;
  let remainder: ShapeId | null = null;
  let divided = false;
  if (faces.length) {
    const resolved = await Promise.all(faces.map((face) => input.resolve(face)));
    if (resolved.some((face) => face === null))
      return err('invalid-result', 'A selected body is no longer available.');
    const parts = await kernel.partition(
      input.body,
      resolved.filter((face): face is ShapeId => face !== null),
    );
    if (!parts.ok) return parts;
    selected = parts.value.selected;
    remainder = parts.value.remainder;
    divided = true;
  }
  let temporary: ShapeId | null = null;
  try {
    const moved = await transform(selected);
    if (!moved.ok) return moved;
    if (!copy && !remainder)
      return { ok: true, value: { body: moved.value.shape, evolution: moved.value.evolution } };
    temporary = moved.value.shape;
    const combined = await kernel.compound(
      copy ? input.body : (remainder ?? input.body),
      temporary,
    );
    if (!combined.ok) return combined;
    const evolution = copy
      ? combined.value.evolution
      : {
          unchanged: [...combined.value.evolution.unchanged, ...moved.value.evolution.unchanged],
          generated: moved.value.evolution.generated,
          modified: moved.value.evolution.modified,
          deleted: moved.value.evolution.deleted,
        };
    return { ok: true, value: { body: combined.value.shape, evolution } };
  } finally {
    if (temporary) await kernel.dispose(temporary);
    if (divided) await kernel.dispose(selected);
    if (remainder) await kernel.dispose(remainder);
  }
}
