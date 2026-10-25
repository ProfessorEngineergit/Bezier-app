import { describe, expect, it } from 'vitest';
import { FACES } from './ViewCube.js';
import { bevelledCube, cubeAxes } from './view-cube-geometry.js';

const HALF = 24;
const EDGE = 5;
const CORNER = 16;
const cube = bevelledCube(FACES, HALF, EDGE, CORNER);

/** The matrix3d numbers of a face's transform. */
const matrix = (transform: string) =>
  (/matrix3d\((.*)\)/.exec(transform)?.[1] ?? '').split(',').map(Number);

describe('the bevelled orientation cube', () => {
  it('has six sides, twelve edges and eight corners', () => {
    expect(cube.filter((f) => f.kind === 'side')).toHaveLength(6);
    expect(cube.filter((f) => f.kind === 'edge')).toHaveLength(12);
    expect(cube.filter((f) => f.kind === 'corner')).toHaveLength(8);
  });

  it('keeps the edge strips narrow and makes the corners six-sided', () => {
    for (const face of cube) {
      const points = face.clipPath.split(',').length;
      if (face.kind === 'side') {
        // Squares with their corners cut: octagons, the full width of the side.
        expect(points).toBe(8);
        expect(face.width).toBeCloseTo(2 * (HALF - EDGE));
      } else if (face.kind === 'edge') {
        expect(Math.min(face.width, face.height)).toBeCloseTo(EDGE * Math.SQRT2);
      } else {
        expect(points).toBe(6);
      }
    }
    const corner = cube.find((face) => face.kind === 'corner');
    const edge = cube.find((face) => face.kind === 'edge');
    // A corner is the bigger target of the two.
    expect((corner?.width ?? 0) * (corner?.height ?? 0)).toBeGreaterThan(
      Math.min(edge?.width ?? 0, edge?.height ?? 0) ** 2 * 3,
    );
  });

  it('lights the top most and the bottom least', () => {
    const side = (view: string) => cube.find((f) => f.kind === 'side' && f.sides[0] === view);
    const top = side('top')?.light ?? 0;
    const bottom = side('bottom')?.light ?? 1;
    expect(top).toBeGreaterThan(side('front')?.light ?? 1);
    expect(side('front')?.light ?? 0).toBeGreaterThan(bottom);
  });

  it('faces every face outward, its box front along its normal', () => {
    for (const face of cube) {
      const m = matrix(face.transform);
      const normal = [m[8], m[9], m[10]];
      const centre = [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0];
      normal.forEach((value, i) => {
        expect(value).toBeCloseTo(face.normal[i] ?? 0, 2);
      });
      const out = centre.reduce((sum, value, i) => sum + value * (face.normal[i] ?? 0), 0);
      expect(out).toBeGreaterThan(HALF - CORNER);
    }
  });

  it('looks from the sides it lies between', () => {
    const edges = cube.filter((f) => f.kind === 'edge');
    for (const edge of edges) expect(new Set(edge.sides).size).toBe(2);
    const corners = cube.filter((f) => f.kind === 'corner');
    for (const corner of corners) expect(new Set(corner.sides).size).toBe(3);
    // Opposite sides never share an edge.
    expect(edges.some((e) => e.sides.includes('top') && e.sides.includes('bottom'))).toBe(false);
    expect(edges.some((e) => e.sides.includes('top') && e.sides.includes('front'))).toBe(true);
  });
});

describe('the axes built into the cube', () => {
  const axes = cubeAxes(HALF, [-1, -1, -1], 61, 13, 2);

  it('runs each arm from the corner along its own axis', () => {
    for (const { axis, strips, labelAt } of axes) {
      expect(strips).toHaveLength(2);
      for (const strip of strips) {
        const m = matrix(strip.transform);
        // The strip's length runs along the axis…
        expect(m[axis]).toBeCloseTo(1);
        // …and its middle is half an arm out from the corner.
        expect(m[12 + axis]).toBeCloseTo(-HALF + 61 / 2);
      }
      expect(labelAt[axis]).toBeCloseTo(-HALF + 61 + 13);
    }
  });

  it('lies outside the bevelled edge it follows, not inside the solid', () => {
    // The X arm runs where the y and z faces would have met; the edge strip there is cut back, so
    // the arm is in the air just off the surface.
    const x = axes[0]?.strips[0];
    const m = matrix(x?.transform ?? '');
    const edgePlane = (2 * HALF - EDGE) / Math.SQRT2;
    const distance = (-(m[13] ?? 0) - (m[14] ?? 0)) / Math.SQRT2;
    expect(distance).toBeGreaterThan(edgePlane);
  });
});
