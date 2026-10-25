/**
 * Variables driving a real rebuild: change the number, the part changes. Against the real
 * kernel; the solver places a fixed 40 × 60 rectangle.
 */

import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import type { ConstraintSolver, Point2, SketchId } from '@bezier/solver';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CadDocument, createEmptyDocument } from '../document.js';
import { apply, invert } from '../journal/journal.js';
import type { Operation } from '../journal/operations.js';
import { parseProjectFile } from '../project-file.js';
import { rebuild } from './rebuild.js';

const solver: ConstraintSolver = {
  solve: () => ({
    status: 'solved',
    positions: new Map<SketchId, Point2>([
      ['p0', { x: 0, y: 0 }],
      ['p1', { x: 40, y: 0 }],
      ['p2', { x: 40, y: 60 }],
      ['p3', { x: 0, y: 60 }],
    ]),
    radii: new Map(),
    dof: 0,
    conflicting: [],
    redundant: [],
  }),
  dispose() {},
};

function part(): CadDocument {
  const corners = ['p0', 'p1', 'p2', 'p3'];
  return {
    ...createEmptyDocument('Test', () => new Date('2026-09-27T12:00:00.000Z')),
    features: [
      {
        id: 'sketch-1',
        type: 'sketch',
        name: 'Sketch',
        params: {
          plane: 'XY',
          sketch: {
            primitives: [
              ...corners.map((id) => ({ kind: 'point' as const, id, x: 0, y: 0 })),
              ...corners.map((id, i) => ({
                kind: 'line' as const,
                id: `l${i}`,
                start: id,
                end: corners[(i + 1) % 4] as SketchId,
              })),
            ],
            constraints: [],
          },
        },
      },
      {
        id: 'extrude-1',
        type: 'extrude',
        name: 'Extrude',
        params: { sketch: 'sketch-1', distance: 10, direction: 'forward', operation: 'new' },
      },
    ],
  };
}

function run(document: CadDocument, ...ops: Operation[]): CadDocument {
  return ops.reduce((current, op) => {
    const result = apply(current, op);
    if (!result.ok) throw new Error(result.reason);
    return result.document;
  }, document);
}

describe('variables in a rebuild', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, 120_000);

  const height = async (document: CadDocument) => {
    const result = await rebuild(document, { kernel, solver });
    const positions = result.mesh?.positions ?? new Float32Array();
    let top = Number.NEGATIVE_INFINITY;
    for (let i = 2; i < positions.length; i += 3) top = Math.max(top, positions[i] ?? top);
    return { top, status: result.statuses.get('extrude-1') };
  };

  it('builds a depth written in terms of a variable, and follows the variable', async () => {
    const driven = run(
      part(),
      { op: 'setVariable', name: 'wall', expression: '4 mm' },
      { op: 'setExpression', id: 'extrude-1', param: 'distance', expression: 'wall * 3 + 1 cm' },
    );
    expect((await height(driven)).top).toBeCloseTo(22);
    const changed = run(driven, { op: 'setVariable', name: 'wall', expression: '5' });
    expect((await height(changed)).top).toBeCloseTo(25);
  });

  it('marks only the feature broken when its expression cannot be evaluated', async () => {
    const broken = run(part(), {
      op: 'setExpression',
      id: 'extrude-1',
      param: 'distance',
      expression: 'missing * 2',
    });
    const { status } = await height(broken);
    expect(status).toEqual({
      state: 'failed',
      message: 'Distance = missing * 2: There is no variable "missing".',
    });
  });

  it('undoes back to the identical document', () => {
    const start = run(part(), { op: 'setVariable', name: 'a', expression: '1' });
    for (const op of [
      { op: 'setVariable', name: 'b', expression: '2', index: 0 },
      { op: 'setVariable', name: 'a', expression: '' },
      { op: 'setVariable', name: 'a', expression: '7' },
      { op: 'setExpression', id: 'extrude-1', param: 'distance', expression: 'a' },
    ] satisfies Operation[]) {
      const inverse = invert(start, op);
      if (inverse === null) throw new Error('not undoable');
      expect(run(run(start, op), inverse)).toEqual(start);
    }
  });

  it('refuses a variable called like a unit', () => {
    expect(apply(part(), { op: 'setVariable', name: 'mm', expression: '1' }).ok).toBe(false);
  });

  it('saves and loads variables and expressions', () => {
    const driven = run(
      part(),
      { op: 'setVariable', name: 'wall', expression: '4' },
      { op: 'setExpression', id: 'extrude-1', param: 'distance', expression: 'wall * 2' },
    );
    const loaded = parseProjectFile(JSON.stringify(driven));
    expect(loaded.meta.variables).toEqual([{ name: 'wall', expression: '4' }]);
    expect(loaded.features[1]?.expressions).toEqual({ distance: 'wall * 2' });
    const plain = parseProjectFile(JSON.stringify(part()));
    expect('variables' in plain.meta).toBe(false);
    expect(plain.features.some((feature) => 'expressions' in feature)).toBe(false);
  });
});
