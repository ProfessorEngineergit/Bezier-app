/**
 * Combine: join, cut or intersect existing bodies, each selected by a face (ADR 0012). Tool faces
 * keep their names. Kept tools are duplicated first, since a face cannot have two names.
 */

import { err, type KernelResult, type ShapeId, type ShapeWithHistory } from '@bezier/kernel';
import { reassemble, resolveFaces } from './bodies.js';
import { defineFeature } from './registry.js';

const KERNEL_OPERATION = { join: 'fuse', cut: 'cut', intersect: 'intersect' } as const;

export const combineFeature = defineFeature({
  type: 'combine',
  label: 'Combine',

  params: {
    target: { kind: 'geometryRefs', label: 'Target body', of: 'face' },
    tools: { kind: 'geometryRefs', label: 'Tool bodies', of: 'face' },
    operation: {
      kind: 'choice',
      label: 'Operation',
      options: ['join', 'cut', 'intersect'],
      default: 'join',
    },
    keepTools: { kind: 'boolean', label: 'Keep tools', default: false },
  },

  /** Faces with no input ancestor; rare. */
  faceTags: ['face-*'],

  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'There are no bodies to combine.');
    const target = await resolveFaces(input, params.target, 'target body');
    if (!target.ok) return target;
    const tools = await resolveFaces(input, params.tools, 'tool bodies');
    if (!tools.ok) return tools;

    const owners = await kernel.partition(input.body, target.value);
    if (!owners.ok) return owners;
    const intermediates: ShapeId[] = [owners.value.selected];
    let kept: ShapeId | null = null;
    try {
      const others = owners.value.remainder;
      if (others === null) {
        return err('invalid-result', 'Pick at least one tool body besides the target.');
      }
      intermediates.push(others);

      const split = await kernel.partition(others, tools.value);
      if (!split.ok) {
        return err('invalid-result', 'The tool bodies have to be other bodies than the target.');
      }
      intermediates.push(split.value.selected);
      if (split.value.remainder !== null) intermediates.push(split.value.remainder);

      const kind = KERNEL_OPERATION[params.operation];
      let result: KernelResult<ShapeWithHistory>;
      if (params.keepTools) {
        const copy = await kernel.duplicate(split.value.selected);
        if (!copy.ok) return copy;
        intermediates.push(copy.value);
        result =
          kind === 'fuse'
            ? await kernel.fuse(owners.value.selected, copy.value)
            : kind === 'cut'
              ? await kernel.cut(owners.value.selected, copy.value)
              : await kernel.intersect(owners.value.selected, copy.value);
      } else {
        result = await kernel.combine(kind, owners.value.selected, split.value.selected);
      }
      if (!result.ok) return result;
      intermediates.push(result.value.shape);

      const parts = await kernel.solidFaceGroups(result.value.shape);
      if (!parts.ok) return parts;
      if (parts.value.length === 0) {
        return err(
          'invalid-result',
          params.operation === 'intersect'
            ? 'These bodies do not overlap, so their intersection is empty.'
            : 'Nothing of the target body would be left.',
        );
      }

      // Put back untouched bodies and kept tools.
      let whole = result.value;
      const untouched = [
        params.keepTools ? split.value.selected : null,
        split.value.remainder,
      ].filter((shape): shape is ShapeId => shape !== null);
      for (const rest of untouched) {
        const next = await reassemble(kernel, rest, whole);
        if (!next.ok) return next;
        whole = next.value;
        intermediates.push(whole.shape);
      }
      kept = whole.shape;
      return { ok: true, value: { body: whole.shape, evolution: whole.evolution } };
    } finally {
      // Release intermediates; the result is the document's body.
      for (const shape of intermediates) if (shape !== kept) await kernel.dispose(shape);
    }
  },
});
