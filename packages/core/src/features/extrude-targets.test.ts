/**
 * An extrusion that adds or cuts only where told: a cut across two parts limited to one
 * leaves the other whole. Against the real kernel.
 */

import type { GeometryKernel, KernelResult } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import type { ConstraintSolver, Sketch, SketchId } from '@bezier/solver';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CadDocument, createEmptyDocument } from '../document.js';
import { rebuild } from '../rebuild/rebuild.js';
import type { FeatureRecord } from './types.js';

const LOAD_TIMEOUT_MS = 120_000;

/** Solves nothing: every point is already where the sketch says it is. */
function placedSolver(): ConstraintSolver {
  return {
    solve: (sketch) => ({
      status: 'solved',
      positions: new Map(
        sketch.primitives.flatMap((p) =>
          p.kind === 'point' ? [[p.id, { x: p.x, y: p.y }] as const] : [],
        ),
      ),
      radii: new Map(),
      dof: 0,
      conflicting: [],
      redundant: [],
    }),
    dispose: () => {},
  };
}

function rectangle(x0: number, y0: number, x1: number, y1: number): Sketch {
  const corners: [SketchId, number, number][] = [
    ['p0', x0, y0],
    ['p1', x1, y0],
    ['p2', x1, y1],
    ['p3', x0, y1],
  ];
  return {
    primitives: [
      ...corners.map(([id, x, y]) => ({ kind: 'point' as const, id, x, y })),
      ...corners.map(([id], i) => ({
        kind: 'line' as const,
        id: `l${i}`,
        start: id,
        end: corners[(i + 1) % corners.length]?.[0] ?? 'p0',
      })),
    ],
    constraints: [],
  };
}

function sketch(id: string, x0: number, y0: number, x1: number, y1: number): FeatureRecord {
  return {
    id,
    type: 'sketch',
    name: id,
    params: { plane: 'XY', sketch: rectangle(x0, y0, x1, y1) },
  };
}

function extrude(
  id: string,
  sketchId: string,
  distance = 10,
  operation: 'new' | 'add' | 'cut' = 'new',
): FeatureRecord {
  return {
    id,
    type: 'extrude',
    name: id,
    params: { sketch: sketchId, distance, direction: 'forward', operation },
  };
}

function documentOf(...features: FeatureRecord[]): CadDocument {
  return { ...createEmptyDocument('Bodies'), features };
}

function unwrap<T>(result: KernelResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

/** A box at x 0–10, and one standing apart at x 30–40. */
const twoBoxes = [
  sketch('sketch-1', 0, 0, 10, 10),
  extrude('extrude-1', 'sketch-1'),
  sketch('sketch-2', 30, 0, 40, 10),
  extrude('extrude-2', 'sketch-2'),
];

describe('extrude targets', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, LOAD_TIMEOUT_MS);

  /** Face count of the whole result: a cut through a box adds a slot's four walls. */
  const faces = async (...features: FeatureRecord[]) => {
    const result = await rebuild(documentOf(...features), { kernel, solver: placedSolver() });
    for (const [id, status] of result.statuses) {
      if (status.state !== 'ok') throw new Error(`${id}: ${JSON.stringify(status)}`);
    }
    if (result.body === null) throw new Error('no body');
    return unwrap(await kernel.describeFaces(result.body)).length;
  };

  // A slot across both boxes, cut down from above.
  const slot = sketch('sketch-3', -5, 4, 45, 6);
  const cut = (targets: readonly string[]) => ({
    ...extrude('cut-1', 'sketch-3', 10, 'cut'),
    params: { ...extrude('cut-1', 'sketch-3', 10, 'cut').params, targets },
  });

  it('cuts every body it reaches when told nothing', async () => {
    // Each box splits in two across the slot: 2 × (2 × 6) faces.
    expect(await faces(...twoBoxes, slot, cut([]))).toBe(24);
  });

  it('cuts only the body it is limited to', async () => {
    // The first box splits (12 faces), the second stays a plain box (6).
    expect(await faces(...twoBoxes, slot, cut(['F:extrude-1:start']))).toBe(18);
  });
});
