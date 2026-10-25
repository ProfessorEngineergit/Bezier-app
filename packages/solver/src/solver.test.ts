/**
 * `createSolver()` through the public `ConstraintSolver` interface only, so a rewrite of the
 * implementation just has to keep this passing. Tests skip with the load error when the
 * WebAssembly cannot be started.
 */

import { beforeAll, describe, expect, it, type TestContext } from 'vitest';
import type {
  ConstraintSolver,
  Point2,
  SketchConstraint,
  SketchId,
  SketchPrimitive,
  SolveResult,
} from './index.js';
import { createSolver } from './index.js';

// ---- building sketches -----------------------------------------------------
//
// Local to this file: `@bezier/solver` sits under every other package (see the README), so there
// is no builder upstream to import. `packages/ui/src/sketch-builder.ts` has a fuller one.

function point(id: SketchId, x: number, y: number, fixed = false): SketchPrimitive {
  return { kind: 'point', id, x, y, ...(fixed ? { fixed } : {}) };
}
function line(id: SketchId, start: SketchId, end: SketchId): SketchPrimitive {
  return { kind: 'line', id, start, end };
}
function circle(id: SketchId, center: SketchId, radius: number): SketchPrimitive {
  return { kind: 'circle', id, center, radius };
}
function arc(id: SketchId, center: SketchId, start: SketchId, end: SketchId): SketchPrimitive {
  return { kind: 'arc', id, center, start, end };
}
function coincident(id: SketchId, a: SketchId, b: SketchId): SketchConstraint {
  return { kind: 'coincident', id, a, b };
}
function horizontal(id: SketchId, line: SketchId): SketchConstraint {
  return { kind: 'horizontal', id, line };
}
function vertical(id: SketchId, line: SketchId): SketchConstraint {
  return { kind: 'vertical', id, line };
}
function parallel(id: SketchId, a: SketchId, b: SketchId): SketchConstraint {
  return { kind: 'parallel', id, a, b };
}
function perpendicular(id: SketchId, a: SketchId, b: SketchId): SketchConstraint {
  return { kind: 'perpendicular', id, a, b };
}
function tangent(id: SketchId, a: SketchId, b: SketchId): SketchConstraint {
  return { kind: 'tangent', id, a, b };
}
function equal(id: SketchId, a: SketchId, b: SketchId): SketchConstraint {
  return { kind: 'equal', id, a, b };
}
function concentric(id: SketchId, a: SketchId, b: SketchId): SketchConstraint {
  return { kind: 'concentric', id, a, b };
}
function distance(id: SketchId, a: SketchId, b: SketchId, value: number): SketchConstraint {
  return { kind: 'distance', id, a, b, value };
}
function radius(id: SketchId, circle: SketchId, value: number): SketchConstraint {
  return { kind: 'radius', id, circle, value };
}
function angle(id: SketchId, a: SketchId, b: SketchId, valueRadians: number): SketchConstraint {
  return { kind: 'angle', id, a, b, valueRadians };
}
function lock(id: SketchId, point: SketchId, x: number, y: number): SketchConstraint {
  return { kind: 'lock', id, point, x, y };
}

// ---- reading a result back ---------------------------------------------------

/** A solved position, or a test failure naming which id was missing. */
function positionOf(result: SolveResult, id: SketchId): Point2 {
  const found = result.positions.get(id);
  expect(found, `expected a solved position for "${id}"`).toBeDefined();
  return found as Point2;
}

/** A solved radius, or a test failure naming which id was missing. */
function radiusOf(result: SolveResult, id: SketchId): number {
  const found = result.radii.get(id);
  expect(found, `expected a solved radius for "${id}"`).toBeDefined();
  return found as number;
}

// ---- plane geometry, for checking a relationship rather than a coordinate ---
//
// Parallel, perpendicular, tangent and angle pin a relationship and leave position and rotation
// free, so tests check the geometric property, which holds for every valid answer, and not a
// coordinate.

function sub(a: Point2, b: Point2): Point2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function length(v: Point2): number {
  return Math.hypot(v.x, v.y);
}
/** cos(angle between u and v) — 0 exactly when they are perpendicular. */
function cosAngle(u: Point2, v: Point2): number {
  return (u.x * v.x + u.y * v.y) / (length(u) * length(v));
}
/** sin(angle between u and v) — 0 exactly when they are parallel (or anti-parallel). */
function sinAngle(u: Point2, v: Point2): number {
  return (u.x * v.y - u.y * v.x) / (length(u) * length(v));
}
/** Perpendicular distance from `p` to the infinite line through `a` and `b`. */
function distanceToLine(p: Point2, a: Point2, b: Point2): number {
  const along = sub(b, a);
  const toPoint = sub(p, a);
  return Math.abs(along.x * toPoint.y - along.y * toPoint.x) / length(along);
}

describe('createSolver', () => {
  let solver: ConstraintSolver | null = null;
  let unavailable: string | null = null;

  beforeAll(async () => {
    try {
      solver = await createSolver();
    } catch (error) {
      unavailable = error instanceof Error ? error.message : String(error);
    }
  });

  /** The live solver, or a skip — never both. Call first in every test. */
  function ready(ctx: TestContext): ConstraintSolver {
    ctx.skip(solver === null, unavailable ?? undefined);
    return solver as ConstraintSolver;
  }

  describe('a fully constrained sketch', () => {
    it('solves a rectangle to zero degrees of freedom, at the exact size asked for', (ctx) => {
      const s = ready(ctx);
      // Shared point ids close the loop without coincidence constraints. Horizontal/vertical make
      // it a rectangle; the lock and two distances pin its position and size.
      const result = s.solve({
        primitives: [
          point('p0', 1, 1),
          point('p1', 41, 2),
          point('p2', 39, 31),
          point('p3', 2, 29),
          line('l0', 'p0', 'p1'),
          line('l1', 'p1', 'p2'),
          line('l2', 'p2', 'p3'),
          line('l3', 'p3', 'p0'),
        ],
        constraints: [
          horizontal('h0', 'l0'),
          horizontal('h1', 'l2'),
          vertical('v0', 'l1'),
          vertical('v1', 'l3'),
          lock('lock0', 'p0', 0, 0),
          distance('dw', 'p0', 'p1', 40),
          distance('dh', 'p0', 'p3', 30),
        ],
      });

      expect(result.status).toBe('solved');
      expect(result.dof).toBe(0);
      expect(positionOf(result, 'p0')).toEqual({ x: 0, y: 0 });
      expect(positionOf(result, 'p1').x).toBeCloseTo(40, 2);
      expect(positionOf(result, 'p1').y).toBeCloseTo(0, 2);
      expect(positionOf(result, 'p2').x).toBeCloseTo(40, 2);
      expect(positionOf(result, 'p2').y).toBeCloseTo(30, 2);
      expect(positionOf(result, 'p3').x).toBeCloseTo(0, 2);
      expect(positionOf(result, 'p3').y).toBeCloseTo(30, 2);
    });

    it('reports the leftover freedom on the same rectangle missing one dimension', (ctx) => {
      const s = ready(ctx);
      // The lock pins position, horizontal/vertical remove rotation and the width is set, so only
      // the height is free: one degree of freedom.
      const result = s.solve({
        primitives: [
          point('p0', 1, 1),
          point('p1', 41, 2),
          point('p2', 39, 31),
          point('p3', 2, 29),
          line('l0', 'p0', 'p1'),
          line('l1', 'p1', 'p2'),
          line('l2', 'p2', 'p3'),
          line('l3', 'p3', 'p0'),
        ],
        constraints: [
          horizontal('h0', 'l0'),
          horizontal('h1', 'l2'),
          vertical('v0', 'l1'),
          vertical('v1', 'l3'),
          lock('lock0', 'p0', 0, 0),
          distance('dw', 'p0', 'p1', 40),
        ],
      });

      expect(result.status).toBe('under-constrained');
      expect(result.dof).toBe(1);
      // What is pinned must still hold, which tells a missing dimension apart from a failed solve.
      expect(positionOf(result, 'p0')).toEqual({ x: 0, y: 0 });
      expect(positionOf(result, 'p1').x).toBeCloseTo(40, 2);
    });
  });

  describe('the relational constraints', () => {
    it('coincident pulls two separate points onto the same spot', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({
        primitives: [point('a', 0, 0, true), point('b', 5, 5)],
        constraints: [coincident('c', 'a', 'b')],
      });
      const a = positionOf(result, 'a');
      const b = positionOf(result, 'b');
      expect(b.x).toBeCloseTo(a.x, 2);
      expect(b.y).toBeCloseTo(a.y, 2);
    });

    it('parallel lines end up with no rotation between their directions', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({
        primitives: [
          point('a1', 0, 0, true),
          point('a2', 10, 0, true),
          point('b1', 0, 5, true),
          point('b2', 8, 9),
          line('la', 'a1', 'a2'),
          line('lb', 'b1', 'b2'),
        ],
        constraints: [parallel('c', 'la', 'lb')],
      });
      const u = sub(positionOf(result, 'a2'), positionOf(result, 'a1'));
      const v = sub(positionOf(result, 'b2'), positionOf(result, 'b1'));
      expect(sinAngle(u, v)).toBeCloseTo(0, 3);
    });

    it('perpendicular lines end up at a right angle to each other', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({
        primitives: [
          point('a1', 0, 0, true),
          point('a2', 10, 0, true),
          point('b1', 0, 0, true),
          point('b2', 6, 4),
          line('la', 'a1', 'a2'),
          line('lb', 'b1', 'b2'),
        ],
        constraints: [perpendicular('c', 'la', 'lb')],
      });
      const u = sub(positionOf(result, 'a2'), positionOf(result, 'a1'));
      const v = sub(positionOf(result, 'b2'), positionOf(result, 'b1'));
      expect(cosAngle(u, v)).toBeCloseTo(0, 3);
    });

    it('tangent keeps a line touching a circle at exactly one point', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({
        primitives: [
          point('c', 0, 0, true),
          circle('circ', 'c', 5),
          point('l1', -10, 8),
          point('l2', 10, 12),
          line('ln', 'l1', 'l2'),
        ],
        constraints: [tangent('t', 'ln', 'circ')],
      });
      const p1 = positionOf(result, 'l1');
      const p2 = positionOf(result, 'l2');
      const centre = positionOf(result, 'c');
      const r = radiusOf(result, 'circ');
      expect(distanceToLine(centre, p1, p2)).toBeCloseTo(r, 2);
    });

    it('tangent keeps two circles touching, internally or externally', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({
        primitives: [
          point('c1', 0, 0, true),
          circle('a', 'c1', 4),
          point('c2', 9, 1),
          circle('b', 'c2', 3),
        ],
        constraints: [tangent('t', 'a', 'b')],
      });
      const centreDistance = length(sub(positionOf(result, 'c2'), positionOf(result, 'c1')));
      const ra = radiusOf(result, 'a');
      const rb = radiusOf(result, 'b');
      // Tangent either side by side (distance = sum of radii) or one inside the other (difference).
      // Which one the solver reaches depends on where the second circle started, so both pass.
      const externallyTangent = Math.abs(centreDistance - (ra + rb)) < 0.01;
      const internallyTangent = Math.abs(centreDistance - Math.abs(ra - rb)) < 0.01;
      expect(externallyTangent || internallyTangent).toBe(true);
    });

    it('equal gives two lines the same length', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({
        primitives: [
          point('a1', 0, 0, true),
          point('a2', 12, 0, true),
          point('b1', 0, 5, true),
          point('b2', 7, 5),
          line('la', 'a1', 'a2'),
          line('lb', 'b1', 'b2'),
        ],
        constraints: [equal('c', 'la', 'lb')],
      });
      const lenA = length(sub(positionOf(result, 'a2'), positionOf(result, 'a1')));
      const lenB = length(sub(positionOf(result, 'b2'), positionOf(result, 'b1')));
      expect(lenB).toBeCloseTo(lenA, 2);
    });

    it('equal gives two circles the same radius', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({
        primitives: [
          point('c1', 0, 0, true),
          circle('a', 'c1', 6),
          point('c2', 20, 0, true),
          circle('b', 'c2', 2),
        ],
        constraints: [equal('c', 'a', 'b')],
      });
      expect(radiusOf(result, 'b')).toBeCloseTo(radiusOf(result, 'a'), 2);
    });

    it('concentric pulls two circles onto the same centre', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({
        primitives: [
          point('c1', 0, 0, true),
          circle('a', 'c1', 6),
          point('c2', 3, 3),
          circle('b', 'c2', 2),
        ],
        constraints: [concentric('c', 'a', 'b')],
      });
      const centreA = positionOf(result, 'c1');
      const centreB = positionOf(result, 'c2');
      expect(centreB.x).toBeCloseTo(centreA.x, 2);
      expect(centreB.y).toBeCloseTo(centreA.y, 2);
    });
  });

  describe('the dimensional constraints', () => {
    it('distance places two points exactly that far apart', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({
        primitives: [point('a', 2, 3, true), point('b', 5, 1)],
        constraints: [distance('d', 'a', 'b', 17)],
      });
      const measured = length(sub(positionOf(result, 'b'), positionOf(result, 'a')));
      expect(measured).toBeCloseTo(17, 2);
    });

    it('radius sets a circle to exactly the requested size', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({
        primitives: [point('c', 0, 0, true), circle('circ', 'c', 1)],
        constraints: [radius('r', 'circ', 12.5)],
      });
      expect(radiusOf(result, 'circ')).toBeCloseTo(12.5, 2);
    });

    it('angle sets the angle between two lines', (ctx) => {
      const s = ready(ctx);
      const requested = Math.PI / 3; // 60°, unambiguous — nowhere near 0 or π.
      const result = s.solve({
        primitives: [
          point('a1', 0, 0, true),
          point('a2', 10, 0, true),
          point('b1', 0, 0, true),
          point('b2', 4, 9),
          line('la', 'a1', 'a2'),
          line('lb', 'b1', 'b2'),
        ],
        constraints: [angle('an', 'la', 'lb', requested)],
      });
      const u = sub(positionOf(result, 'a2'), positionOf(result, 'a1'));
      const v = sub(positionOf(result, 'b2'), positionOf(result, 'b1'));
      const measured = Math.acos(Math.max(-1, Math.min(1, cosAngle(u, v))));
      expect(measured).toBeCloseTo(requested, 2);
    });
  });

  describe('pinning a point', () => {
    it('a point marked fixed does not move, even to satisfy another constraint', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({
        primitives: [point('a', 3, 4, true), point('b', 0, 0), line('ln', 'a', 'b')],
        constraints: [distance('d', 'a', 'b', 9)],
      });
      // Fixed, so it must read back exactly, not merely close: a solver that nudges fixed points
      // would otherwise pass.
      expect(positionOf(result, 'a')).toEqual({ x: 3, y: 4 });
      expect(length(sub(positionOf(result, 'b'), positionOf(result, 'a')))).toBeCloseTo(9, 2);
    });

    it('lock moves a point to its target and everything downstream follows', (ctx) => {
      const s = ready(ctx);
      // Seeded away from the lock's target, to catch an implementation that treats `lock` as
      // already satisfied or measures distance from the point's starting coordinates.
      const result = s.solve({
        primitives: [point('a', 100, 100), point('b', 0, 0), line('ln', 'a', 'b')],
        constraints: [lock('lk', 'a', 3, 4), distance('d', 'a', 'b', 9)],
      });
      expect(positionOf(result, 'a').x).toBeCloseTo(3, 2);
      expect(positionOf(result, 'a').y).toBeCloseTo(4, 2);
      expect(length(sub(positionOf(result, 'b'), positionOf(result, 'a')))).toBeCloseTo(9, 2);
    });
  });

  describe('diagnostics', () => {
    it('flags two constraints that directly contradict each other', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({
        primitives: [point('a', 0, 0, true), point('b', 10, 0)],
        constraints: [distance('d40', 'a', 'b', 40), distance('d50', 'a', 'b', 50)],
      });
      expect(result.status).toBe('conflicting');
      expect(result.conflicting.length).toBeGreaterThan(0);
      expect(
        result.conflicting.includes('d40') || result.conflicting.includes('d50'),
        'expected one of the two contradicting constraints to be named',
      ).toBe(true);
    });

    it('flags a constraint that only restates one already there', (ctx) => {
      const s = ready(ctx);
      // The same distance between the same two points, twice: one must come back in `redundant`.
      const result = s.solve({
        primitives: [point('a', 0, 0, true), point('b', 10, 0)],
        constraints: [distance('d1', 'a', 'b', 40), distance('d2', 'a', 'b', 40)],
      });
      expect(result.status).not.toBe('conflicting');
      expect(result.status).not.toBe('failed');
      expect(result.redundant.length).toBeGreaterThan(0);
    });
  });

  describe('the starting guess decides which valid answer comes back', () => {
    // Two fixed circles of radius 5, centres 8 mm apart, meet at (4, 3) and (4, -3). A point at
    // distance 5 from both centres can only pick one by where it started, the case the interface
    // doc names: "dragging a point feels continuous rather than teleporting".
    function twoCircleFixture(seedX: number, seedY: number) {
      return {
        primitives: [
          point('ca', 0, 0, true),
          circle('a', 'ca', 5),
          point('cb', 8, 0, true),
          circle('b', 'cb', 5),
          point('p', seedX, seedY),
        ],
        constraints: [distance('da', 'p', 'ca', 5), distance('db', 'p', 'cb', 5)],
      };
    }

    it('seeded near the upper intersection, it lands there', (ctx) => {
      const s = ready(ctx);
      const result = s.solve(twoCircleFixture(4, 3.5));
      expect(positionOf(result, 'p').y).toBeGreaterThan(0);
      expect(positionOf(result, 'p').x).toBeCloseTo(4, 1);
      expect(Math.abs(positionOf(result, 'p').y)).toBeCloseTo(3, 1);
    });

    it('seeded near the lower intersection, it lands there instead', (ctx) => {
      const s = ready(ctx);
      const result = s.solve(twoCircleFixture(4, -3.5));
      expect(positionOf(result, 'p').y).toBeLessThan(0);
      expect(positionOf(result, 'p').x).toBeCloseTo(4, 1);
      expect(Math.abs(positionOf(result, 'p').y)).toBeCloseTo(3, 1);
    });
  });

  describe('arcs', () => {
    // A quarter circle of radius 10 around the origin, counter-clockwise from (10, 0)
    // to (0, 10). Only the centre is fixed; the endpoints are free to move.
    const quarter = () => [
      point('c', 0, 0, true),
      point('s', 10, 0),
      point('e', 0, 10),
      arc('a', 'c', 's', 'e'),
    ];

    it('a radius constraint sets the arc radius, and both endpoints follow it', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({ primitives: quarter(), constraints: [radius('r', 'a', 15)] });
      const centre = positionOf(result, 'c');
      expect(radiusOf(result, 'a')).toBeCloseTo(15, 2);
      expect(length(sub(positionOf(result, 's'), centre))).toBeCloseTo(15, 2);
      expect(length(sub(positionOf(result, 'e'), centre))).toBeCloseTo(15, 2);
    });

    it('dimensioning one endpoint drags the other along — that is what arc_rules is for', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({ primitives: quarter(), constraints: [distance('d', 'c', 's', 20)] });
      const centre = positionOf(result, 'c');
      expect(length(sub(positionOf(result, 'e'), centre))).toBeCloseTo(20, 2);
    });

    it('an arc stays counter-clockwise from its start to its end', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({ primitives: quarter(), constraints: [radius('r', 'a', 15)] });
      // Start on the +x side, end on the +y side: a quarter turn anticlockwise, not the
      // three-quarter turn the other way round.
      expect(positionOf(result, 's').x).toBeGreaterThan(0);
      expect(positionOf(result, 'e').y).toBeGreaterThan(0);
    });

    it('an arc whose end angle is numerically below its start angle keeps its shape', (ctx) => {
      const s = ready(ctx);
      // From 170 degrees to 190 degrees (-170 as atan2 reports it), across the -x axis.
      const at = (degrees: number, r: number): [number, number] => [
        r * Math.cos((degrees * Math.PI) / 180),
        r * Math.sin((degrees * Math.PI) / 180),
      ];
      const [sx, sy] = at(170, 10);
      const [ex, ey] = at(190, 10);
      const result = s.solve({
        primitives: [
          point('c', 0, 0, true),
          point('s', sx, sy),
          point('e', ex, ey),
          arc('a', 'c', 's', 'e'),
        ],
        constraints: [radius('r', 'a', 12)],
      });
      const centre = positionOf(result, 'c');
      expect(length(sub(positionOf(result, 's'), centre))).toBeCloseTo(12, 2);
      expect(length(sub(positionOf(result, 'e'), centre))).toBeCloseTo(12, 2);
      expect(positionOf(result, 's').y).toBeGreaterThan(0);
      expect(positionOf(result, 'e').y).toBeLessThan(0);
    });

    it('concentric puts an arc and a circle on one centre', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({
        primitives: [...quarter(), point('k', 3, 3), circle('o', 'k', 5)],
        constraints: [concentric('cc', 'a', 'o')],
      });
      expect(positionOf(result, 'k').x).toBeCloseTo(positionOf(result, 'c').x, 2);
      expect(positionOf(result, 'k').y).toBeCloseTo(positionOf(result, 'c').y, 2);
    });

    it('equal gives a circle and an arc the same radius', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({
        primitives: [...quarter(), point('k', 30, 0, true), circle('o', 'k', 3)],
        constraints: [radius('r', 'o', 7), equal('q', 'o', 'a')],
      });
      expect(radiusOf(result, 'o')).toBeCloseTo(7, 2);
      expect(radiusOf(result, 'a')).toBeCloseTo(7, 2);
    });

    it('tangent keeps a line at exactly the arc radius from its centre', (ctx) => {
      const s = ready(ctx);
      const result = s.solve({
        primitives: [
          ...quarter(),
          point('l1', -10, 14),
          point('l2', 10, 16),
          line('ln', 'l1', 'l2'),
        ],
        constraints: [tangent('t', 'ln', 'a')],
      });
      const centre = positionOf(result, 'c');
      const distanceToCentre = distanceToLine(
        centre,
        positionOf(result, 'l1'),
        positionOf(result, 'l2'),
      );
      expect(distanceToCentre).toBeCloseTo(radiusOf(result, 'a'), 2);
    });
  });

  it('disposes without throwing', (ctx) => {
    const s = ready(ctx);
    expect(() => s.dispose()).not.toThrow();
  });
});
