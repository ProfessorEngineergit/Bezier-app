/**
 * The rebuild pipeline against the real OCCT kernel, with the solver stubbed. The key test is
 * `survives an edit to an earlier feature`: a fillet keeps its edge.
 */

import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import type { ConstraintSolver, Point2, Sketch, SketchId, SolveResult } from '@bezier/solver';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { CadDocument } from '../document.js';
import { createEmptyDocument } from '../document.js';
import type { FeatureRecord } from '../features/types.js';
import { parseRef } from '../stable-ref.js';
import { rebuild } from './rebuild.js';

const LOAD_TIMEOUT_MS = 120_000;

/** A rectangle as four corners joined by four lines. */
function rectangleSketch(): Sketch {
  const corners = ['p0', 'p1', 'p2', 'p3'];
  return {
    primitives: [
      ...corners.map((id) => ({ kind: 'point' as const, id, x: 0, y: 0 })),
      ...corners.map((id, i) => ({
        kind: 'line' as const,
        id: `l${i}`,
        start: id,
        end: corners[(i + 1) % corners.length] as SketchId,
      })),
    ],
    constraints: [],
  };
}

/**
 * A solver that always places the rectangle at a fixed size. These tests are about what happens to
 * names when geometry changes, so the sketch must not vary.
 */
function stubSolver(width = 40, height = 60): ConstraintSolver {
  return {
    solve(): SolveResult {
      const positions = new Map<SketchId, Point2>([
        ['p0', { x: 0, y: 0 }],
        ['p1', { x: width, y: 0 }],
        ['p2', { x: width, y: height }],
        ['p3', { x: 0, y: height }],
      ]);
      return {
        status: 'solved',
        positions,
        radii: new Map(),
        dof: 0,
        conflicting: [],
        redundant: [],
      };
    },
    dispose() {},
  };
}

function documentWith(...features: FeatureRecord[]): CadDocument {
  const base = createEmptyDocument('Test', () => new Date('2026-08-05T12:00:00.000Z'));
  return { ...base, features };
}

const sketch: FeatureRecord = {
  id: 'sketch-1',
  type: 'sketch',
  name: 'Sketch',
  params: { plane: 'XY', sketch: rectangleSketch() },
};

function extrude(distance: number): FeatureRecord {
  return {
    id: 'extrude-1',
    type: 'extrude',
    name: 'Extrude',
    params: { sketch: 'sketch-1', distance, direction: 'forward', operation: 'new' },
  };
}

describe('rebuild', () => {
  let kernel: GeometryKernel;

  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, LOAD_TIMEOUT_MS);

  const deps = () => ({ kernel, solver: stubSolver() });

  it('turns a sketch and an extrude into a solid', async () => {
    const result = await rebuild(documentWith(sketch, extrude(15)), deps());

    expect(result.statuses.get('sketch-1')).toEqual({ state: 'ok' });
    expect(result.statuses.get('extrude-1')).toEqual({ state: 'ok' });
    expect(result.mesh).not.toBeNull();
    expect(result.edges).not.toBeNull();
  });

  it('keeps an open sketch valid while refusing to extrude it', async () => {
    const open: FeatureRecord = {
      ...sketch,
      params: {
        plane: 'XY',
        sketch: {
          primitives: [
            { kind: 'point', id: 'p0', x: 0, y: 0 },
            { kind: 'point', id: 'p1', x: 40, y: 0 },
            { kind: 'line', id: 'l0', start: 'p0', end: 'p1' },
          ],
          constraints: [],
        },
      },
    };

    const saved = await rebuild(documentWith(open), deps());
    expect(saved.statuses.get('sketch-1')).toEqual({ state: 'ok' });

    const consumed = await rebuild(documentWith(open, extrude(15)), deps());
    expect(consumed.statuses.get('sketch-1')).toEqual({ state: 'ok' });
    expect(consumed.statuses.get('extrude-1')?.state).toBe('failed');
  });

  it('names every face of the body it built', async () => {
    const result = await rebuild(documentWith(sketch, extrude(15)), deps());

    const names = [...result.naming.knownNames()];
    expect(names).toHaveLength(6);
    // Named by provenance (which feature made them), not by position (ADR 0001).
    for (const name of names) expect(name).toMatch(/^F:extrude-1:/);
  });

  it('names edges as the seam between two named faces', async () => {
    const result = await rebuild(documentWith(sketch, extrude(15)), deps());
    const edges = await result.naming.namedEdges(kernel);

    expect(edges.size).toBe(12);
    for (const name of edges.keys()) {
      const ref = parseRef(name);
      expect(ref.kind).toBe('edge');
    }
  });

  it(
    'survives an edit to an earlier feature',
    async () => {
      // Step 9 of the vertical slice: round an edge, then change a dimension further up the
      // history. The round must stay on the edge the user picked.
      const first = await rebuild(documentWith(sketch, extrude(15)), deps());
      const edges = await first.naming.namedEdges(kernel);

      const pickedEdge = [...edges.keys()].sort()[0];
      expect(pickedEdge).toBeDefined();

      const fillet: FeatureRecord = {
        id: 'fillet-1',
        type: 'fillet',
        name: 'Fillet',
        params: { edges: [pickedEdge], radius: 2 },
      };

      const before = await rebuild(documentWith(sketch, extrude(15), fillet), deps());
      expect(before.statuses.get('fillet-1')).toEqual({ state: 'ok' });

      // The edit. Nothing about the fillet's parameters changes, only a dimension above it in the
      // history.
      const after = await rebuild(documentWith(sketch, extrude(25), fillet), deps());

      expect(after.statuses.get('fillet-1')).toEqual({ state: 'ok' });
      expect(after.mesh).not.toBeNull();

      // A box gains exactly one face from one fillet, at either height.
      expect([...after.naming.knownNames()]).toHaveLength(7);
    },
    LOAD_TIMEOUT_MS,
  );

  it('reports a reference that genuinely cannot be resolved', async () => {
    // The failure case. A reference to geometry that never existed must be named in the status and
    // not rounded off some other edge.
    const fillet: FeatureRecord = {
      id: 'fillet-1',
      type: 'fillet',
      name: 'Fillet',
      params: { edges: ['E(F:extrude-1:ghost-a|F:extrude-1:ghost-b)'], radius: 2 },
    };

    const result = await rebuild(documentWith(sketch, extrude(15), fillet), deps());
    const status = result.statuses.get('fillet-1');

    expect(status?.state).toBe('dangling');
    if (status?.state === 'dangling') {
      expect(status.lostRefs.length).toBeGreaterThan(0);
    }
  });
});

describe('partial results', () => {
  let kernel: GeometryKernel;

  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, LOAD_TIMEOUT_MS);

  it('keeps the geometry built before a failure', async () => {
    // ADR 0009: one bad fillet must not cost the other features. The user still sees their part,
    // with a marker on the step that broke.
    const impossible: FeatureRecord = {
      id: 'fillet-1',
      type: 'fillet',
      name: 'Fillet',
      params: { edges: [], radius: 500 },
    };

    const result = await rebuild(documentWith(sketch, extrude(15), impossible), {
      kernel,
      solver: stubSolver(),
    });

    expect(result.statuses.get('extrude-1')).toEqual({ state: 'ok' });
    expect(result.statuses.get('fillet-1')?.state).toBe('failed');
    // The solid from before the failure is still there and still displayable.
    expect(result.mesh).not.toBeNull();
    expect(result.body).not.toBeNull();
  });

  it('keeps building what does not depend on a failure', async () => {
    const broken: FeatureRecord = { id: 'x', type: 'nonexistent', name: 'X', params: {} };
    const later: FeatureRecord = { ...extrude(10), id: 'extrude-2' };

    const result = await rebuild(documentWith(sketch, broken, later), {
      kernel,
      solver: stubSolver(),
    });

    expect(result.statuses.get('x')?.state).toBe('unknown-type');
    // The extrude only needs the sketch, so one unknown step does not cost it.
    expect(result.statuses.get('extrude-2')?.state).toBe('ok');
    expect(result.body).not.toBeNull();
  });

  it('marks what depends on a failure as blocked, and names the cause', async () => {
    const tooBig: FeatureRecord = {
      id: 'fillet-1',
      type: 'fillet',
      name: 'Big fillet',
      params: { edges: ['E(F:extrude-1:end|F:extrude-1:side-0)'], radius: 500 },
    };
    const onFillet: FeatureRecord = {
      id: 'shell-1',
      type: 'shell',
      name: 'Shell',
      params: { faces: ['F:fillet-1:blend-0'], thickness: 1 },
    };

    const result = await rebuild(documentWith(sketch, extrude(10), tooBig, onFillet), {
      kernel,
      solver: stubSolver(),
    });

    expect(result.statuses.get('fillet-1')?.state).toBe('failed');
    expect(result.statuses.get('shell-1')).toEqual({
      state: 'blocked',
      message: 'Skipped because Big fillet could not be built.',
    });
  });

  it('reports a sketch the solver cannot read as one failed feature, not a failed rebuild', async () => {
    // What planegcs does with a sketch that uses an id twice: it throws.
    const unreadable: ConstraintSolver = {
      solve(): SolveResult {
        throw new Error('object with id c3 already exists');
      },
      dispose() {},
    };

    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await rebuild(documentWith(sketch, extrude(10)), {
      kernel,
      solver: unreadable,
    });
    // The original text is kept for whoever debugs it, just not shown as the message.
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('sketch-1'),
      expect.objectContaining({ message: 'object with id c3 already exists' }),
    );
    logged.mockRestore();

    expect(result.statuses.get('sketch-1')).toEqual({
      state: 'failed',
      message: 'This sketch has references the solver cannot read.',
    });
    expect(result.statuses.get('extrude-1')?.state).toBe('blocked');
    expect(result.body).toBeNull();
  });

  it('skips a suppressed feature without failing anything', async () => {
    const suppressed: FeatureRecord = { ...extrude(15), suppressed: true };
    const result = await rebuild(documentWith(sketch, suppressed), {
      kernel,
      solver: stubSolver(),
    });

    expect(result.statuses.get('extrude-1')).toEqual({ state: 'suppressed' });
    expect(result.mesh).toBeNull();
  });
});
