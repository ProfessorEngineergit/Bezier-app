/**
 * Pattern: repeats bodies linearly (each copy offset `dx, dy, dz`) or circularly (`count` copies
 * over `angle`; a full turn does not duplicate the first). Copies are added in one step, so their
 * faces are new and the original's unchanged.
 */
import type { GeometryKernel, KernelResult, ShapeId, ShapeWithHistory } from '@bezier/kernel';
import { err } from '@bezier/kernel';
import { defineFeature } from './registry.js';

export const patternFeature = defineFeature({
  type: 'pattern',
  label: 'Pattern',
  params: {
    faces: { kind: 'geometryRefs', label: 'Bodies', of: 'face', default: [] },
    arrangement: {
      kind: 'choice',
      label: 'Arrangement',
      options: ['linear', 'circular'],
      default: 'linear',
    },
    count: { kind: 'count', label: 'Count', default: 3, min: 2 },
    dx: { kind: 'length', label: 'Step X', default: 20 },
    dy: { kind: 'length', label: 'Step Y', default: 0 },
    dz: { kind: 'length', label: 'Step Z', default: 0 },
    axis: { kind: 'choice', label: 'Axis', options: ['z', 'x', 'y'], default: 'z' },
    angle: { kind: 'angle', label: 'Spread', default: 360, degrees: true, min: 1, max: 360 },
    ox: { kind: 'length', label: 'Axis X', default: 0 },
    oy: { kind: 'length', label: 'Axis Y', default: 0 },
    oz: { kind: 'length', label: 'Axis Z', default: 0 },
  },
  faceTags: ['copy-*'],
  async rebuild(kernel, params, input) {
    if (input.body === null) return err('invalid-result', 'Select a body to repeat.');
    if (params.count > 200) return err('invalid-result', 'A pattern is limited to 200 copies.');

    let source = input.body;
    let divided = false;
    if (params.faces.length > 0) {
      const resolved = await Promise.all(params.faces.map((face) => input.resolve(face)));
      const handles = resolved.filter((face): face is ShapeId => face !== null);
      if (handles.length !== resolved.length) {
        return err('invalid-result', 'A body in this pattern is no longer there.');
      }
      const parts = await kernel.partition(input.body, handles);
      if (!parts.ok) return parts;
      source = parts.value.selected;
      divided = true;
      if (parts.value.remainder !== null) await kernel.dispose(parts.value.remainder);
    }

    const full = params.angle >= 359.999;
    const turn =
      ((full ? params.angle / params.count : params.angle / (params.count - 1)) * Math.PI) / 180;
    const axis = {
      x: +(params.axis === 'x'),
      y: +(params.axis === 'y'),
      z: +(params.axis === 'z'),
    };
    const place = (i: number): Promise<KernelResult<ShapeWithHistory>> =>
      params.arrangement === 'linear'
        ? kernel.translate(source, { x: params.dx * i, y: params.dy * i, z: params.dz * i })
        : kernel.rotate(source, { x: params.ox, y: params.oy, z: params.oz }, axis, turn * i);

    const made: ShapeId[] = [];
    try {
      let copies: ShapeId | null = null;
      for (let i = 1; i < params.count; i += 1) {
        const copy = await place(i);
        if (!copy.ok) return copy;
        made.push(copy.value.shape);
        if (copies === null) {
          copies = copy.value.shape;
          continue;
        }
        const joined = await kernel.compound(copies, copy.value.shape);
        if (!joined.ok) return joined;
        made.push(joined.value.shape);
        copies = joined.value.shape;
      }
      if (copies === null) return err('invalid-result', 'A pattern needs at least two.');
      return await added(kernel, input.body, copies);
    } finally {
      for (const shape of made) await kernel.dispose(shape);
      if (divided) await kernel.dispose(source);
    }
  },
});

async function added(kernel: GeometryKernel, body: ShapeId, copies: ShapeId) {
  const combined = await kernel.compound(body, copies);
  if (!combined.ok) return combined;
  return {
    ok: true as const,
    value: { body: combined.value.shape, evolution: combined.value.evolution },
  };
}
