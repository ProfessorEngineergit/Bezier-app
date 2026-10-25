/** Loft and Sweep through the whole rebuild: real solver, real kernel (ADR 0017). */
import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { type ConstraintSolver, createSolver, type SketchPrimitive } from '@bezier/solver';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CadDocument, createEmptyDocument } from '../document.js';
import { rebuild } from '../rebuild/rebuild.js';
import { parseRef } from '../stable-ref.js';

const pt = (id: string, x: number, y: number): SketchPrimitive => ({ kind: 'point', id, x, y });
const line = (id: string, start: string, end: string): SketchPrimitive => ({
  kind: 'line',
  id,
  start,
  end,
});
const square = (half: number): SketchPrimitive[] => [
  pt('a', -half, -half),
  pt('b', half, -half),
  pt('c', half, half),
  pt('d', -half, half),
  line('l1', 'a', 'b'),
  line('l2', 'b', 'c'),
  line('l3', 'c', 'd'),
  line('l4', 'd', 'a'),
];
const sketch = (
  id: string,
  primitives: SketchPrimitive[],
  extra: Record<string, unknown> = {},
) => ({
  id,
  type: 'sketch',
  name: id,
  params: { plane: 'XY', sketch: { primitives, constraints: [] }, ...extra },
});
const doc = (features: CadDocument['features']): CadDocument => ({
  ...createEmptyDocument('Loft and sweep'),
  features,
});

describe('loft and sweep (audit F-032, F-033)', () => {
  let kernel: GeometryKernel;
  let solver: ConstraintSolver;
  beforeAll(async () => {
    kernel = await createOcctKernel();
    solver = await createSolver();
  }, 120_000);

  it('lofts from one sketch on XY to another 10 mm above it', async () => {
    const result = await rebuild(
      doc([
        sketch('s1', square(10)),
        sketch('s2', square(5), { offset: 10 }),
        { id: 'loft-1', type: 'loft', name: 'Loft', params: { from: 's1', to: 's2', ruled: true } },
      ]),
      { kernel, solver },
    );
    expect(result.statuses.get('loft-1')).toEqual({ state: 'ok' });
    if (result.body === null) throw new Error('no body');
    const mass = await kernel.massProperties(result.body);
    expect(mass.ok && mass.value.volume).toBeCloseTo(2333.33, 0);
    expect([...result.naming.knownNames()].filter((n) => n.startsWith('F:loft-1:'))).toHaveLength(
      6,
    );
  });

  it('sweeps a square along an L of two lines, and refuses a path that branches', async () => {
    const path = [
      pt('p0', 0, 0),
      pt('p1', 0, 30),
      pt('p2', 20, 30),
      line('m1', 'p0', 'p1'),
      line('m2', 'p1', 'p2'),
    ];
    const profile = sketch('profile', square(2), { plane: 'XZ' });
    const ok = await rebuild(
      doc([
        profile,
        sketch('path', path),
        {
          id: 'sweep-1',
          type: 'sweep',
          name: 'Sweep',
          params: { profile: 'profile', path: 'path' },
        },
      ]),
      { kernel, solver },
    );
    expect(ok.statuses.get('sweep-1')).toEqual({ state: 'ok' });
    const branched = await rebuild(
      doc([
        profile,
        sketch('path', [...path, pt('p3', -20, 30), line('m3', 'p1', 'p3')]),
        {
          id: 'sweep-1',
          type: 'sweep',
          name: 'Sweep',
          params: { profile: 'profile', path: 'path' },
        },
      ]),
      { kernel, solver },
    );
    expect(branched.statuses.get('sweep-1')).toEqual({
      state: 'failed',
      message: 'The path branches: three or more of its curves meet at one point.',
    });
  });
});

describe('wrap (audit F-051)', () => {
  let kernel: GeometryKernel;
  let solver: ConstraintSolver;
  beforeAll(async () => {
    kernel = await createOcctKernel();
    solver = await createSolver();
  }, 120_000);

  const cylinder = [
    sketch('base', [pt('c', 0, 0), { kind: 'circle', id: 'k', center: 'c', radius: 20 }]),
    {
      id: 'extrude-1',
      type: 'extrude',
      name: 'Extrude',
      params: { sketch: 'base', distance: 40, direction: 'forward', operation: 'new' },
    },
    // A 30 × 6 band on the XZ plane moved 30 mm out, square to the axis.
    sketch(
      'band',
      square(3).map((p) => (p.kind === 'point' ? { ...p, x: p.x * 5, y: p.y + 20 } : p)),
      {
        plane: 'XZ',
        offset: 30,
      },
    ),
  ];

  it.each([
    [1, 1],
    [-1, -1],
  ])('wraps a band round the wall, %s mm', async (height, sign) => {
    const before = await rebuild(doc(cylinder), { kernel, solver });
    // The round wall, by its name.
    let wall = '';
    for (const name of before.naming.knownNames()) {
      const face = await before.naming.resolve(kernel, parseRef(name));
      const round = face === null ? null : await kernel.faceCylinder(face);
      if (round?.ok === true && round.value !== null) wall = name;
    }
    const wrapped = await rebuild(
      doc([
        ...cylinder,
        {
          id: 'wrap-1',
          type: 'wrap',
          name: 'Wrap',
          params: { sketch: 'band', faces: [wall], height },
        },
      ]),
      { kernel, solver },
    );
    expect(wrapped.statuses.get('wrap-1')).toEqual({ state: 'ok' });
    if (before.body === null || wrapped.body === null) throw new Error('no body');
    const a = await kernel.massProperties(before.body);
    const b = await kernel.massProperties(wrapped.body);
    if (!a.ok || !b.ok) throw new Error('no mass');
    const change = (b.value.volume - a.value.volume) * sign;
    expect(change).toBeGreaterThan(150);
    expect(change).toBeLessThan(210);
  });
});
