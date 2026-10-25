/**
 * Face naming of imported files, against the real kernel: old saved imports keep their names,
 * new imports are named deterministically without measuring every face.
 */

import type { GeometryKernel, KernelResult } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../document.js';
import { rebuild } from '../rebuild/rebuild.js';
import { stubSolver, testSketch } from '../rebuild/testing.js';
import type { FeatureRecord } from './types.js';

const LOAD_TIMEOUT_MS = 120_000;

function unwrap<T>(result: KernelResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

/** The same kernel, counting which methods were asked for. */
function counting(kernel: GeometryKernel) {
  const calls = new Map<string, number>();
  const proxy = new Proxy(kernel, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls.set(String(key), (calls.get(String(key)) ?? 0) + 1);
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { kernel: proxy, calls };
}

describe('naming the faces of an imported file', () => {
  let kernel: GeometryKernel;
  let file: string;

  beforeAll(async () => {
    kernel = await createOcctKernel();
    const box = await rebuild(
      {
        ...createEmptyDocument('Box'),
        features: [
          testSketch,
          {
            id: 'extrude-1',
            type: 'extrude',
            name: 'Extrude',
            params: { sketch: 'sketch-1', distance: 15 },
          },
        ],
      },
      { kernel, solver: stubSolver() },
    );
    if (box.body === null) throw new Error('no body');
    file = unwrap(await kernel.exportStep(box.body));
  }, LOAD_TIMEOUT_MS);

  const importOf = (params: Record<string, unknown>): FeatureRecord => ({
    id: 'import-1',
    type: 'import-step',
    name: 'Import',
    params: { file, ...params },
  });

  const namesAfter = async (params: Record<string, unknown>) => {
    const { kernel: watched, calls } = counting(kernel);
    const result = await rebuild(
      { ...createEmptyDocument('Import'), features: [importOf(params)] },
      { kernel: watched, solver: stubSolver() },
    );
    expect(result.statuses.get('import-1')).toEqual({ state: 'ok' });
    if (result.body === null) throw new Error('no body');
    const faces = unwrap(await kernel.describeFaces(result.body));
    const names = result.naming.snapshot().names;
    return { order: faces.map((face) => names.get(face.hash)), calls };
  };

  it('keeps measuring an import saved without a face order, as it always did', async () => {
    const { order, calls } = await namesAfter({});
    expect(calls.get('measureFaces')).toBe(1);
    expect(new Set(order).size).toBe(6);
  });

  it('names a new import in file order without measuring a face', async () => {
    const first = await namesAfter({ faceOrder: 'file' });
    expect(first.calls.get('measureFaces')).toBeUndefined();
    expect(first.calls.get('bounds')).toBeUndefined();
    expect(first.order).toEqual([0, 1, 2, 3, 4, 5].map((n) => `F:import-1:face-${n}`));
    // The same file read again gives the same names.
    expect((await namesAfter({ faceOrder: 'file' })).order).toEqual(first.order);
  });

  it('shows its outline before it is finished, boxed by its own points', async () => {
    const outlines: { edges: number; size: number[] }[] = [];
    await rebuild(
      { ...createEmptyDocument('Import'), features: [importOf({ faceOrder: 'file' })] },
      {
        kernel,
        solver: stubSolver(),
        onPreview: ({ edges, box }) =>
          outlines.push({
            edges: edges.polylineStarts.length,
            size: [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z],
          }),
      },
    );
    expect(outlines).toHaveLength(1);
    expect(outlines[0]?.edges).toBe(12);
    const [x, y, z] = outlines[0]?.size ?? [];
    expect(x).toBeCloseTo(40, 3);
    expect(y).toBeCloseTo(60, 3);
    expect(z).toBeCloseTo(15, 3);
  });

  it('places a rotated import on Z = 0 while older imports retain their source placement', async () => {
    const source = unwrap(await kernel.importStep(file));
    const rotated = unwrap(
      await kernel.rotate(source, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, -Math.PI / 4),
    );
    const shifted = unwrap(await kernel.translate(rotated.shape, { x: 0, y: 0, z: -12 }));
    const text = unwrap(await kernel.exportStep(shifted.shape));
    const original = unwrap(await kernel.bounds(shifted.shape));
    expect(original.min.z).toBeLessThan(-12);
    for (const placement of ['ground', 'source']) {
      const result = await rebuild(
        {
          ...createEmptyDocument('Placed'),
          features: [importOf({ file: text, faceOrder: 'file', placement })],
        },
        { kernel, solver: stubSolver() },
      );
      if (result.body === null) throw new Error('Imported body did not build');
      const box = unwrap(await kernel.bounds(result.body));
      expect(box.min.z).toBeCloseTo(placement === 'ground' ? 0 : original.min.z, 4);
      expect(box.max.z - box.min.z).toBeCloseTo(original.max.z - original.min.z, 4);
      expect(new Set(result.naming.snapshot().names.values())).toEqual(
        new Set([0, 1, 2, 3, 4, 5].map((n) => `F:import-1:face-${n}`)),
      );
      await kernel.dispose(result.body);
    }
    await kernel.dispose(source);
    await kernel.dispose(rotated.shape);
    await kernel.dispose(shifted.shape);
  });
});
