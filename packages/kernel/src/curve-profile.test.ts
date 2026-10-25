/**
 * Profiles bounded by a spline or an ellipse, extruded by the real kernel. The ellipse is built as
 * a rational B-spline that is the ellipse exactly, so its cap has the area of one: π·a·b.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { KernelResult, ShapeId } from './index.js';
import type { GeometryKernel, Profile, ProfileSegment } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';

function expectOk<T>(result: KernelResult<T>): T {
  if (!result.ok) throw new Error(`kernel refused: [${result.error.code}] ${result.error.message}`);
  return result.value;
}

const onXY = (loop: ProfileSegment[]): Profile => ({
  loops: [loop],
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
});

describe('profiles with spline and ellipse sides', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, 120_000);

  /** The largest face's area: the caps of a prism are its largest faces only when it is flat. */
  const capArea = async (shape: ShapeId) => {
    const faces = expectOk(await kernel.subShapes(shape, 'face'));
    const measured = expectOk(await kernel.measureFaces(faces));
    const tops = measured.filter((face) => Math.abs(face.centre.z - 1) < 1e-6);
    return tops[0]?.area ?? 0;
  };

  it('extrudes a whole ellipse, turned 30°, that is the ellipse exactly', async () => {
    const turn = Math.PI / 6;
    const solid = expectOk(
      await kernel.extrude(
        onXY([
          {
            kind: 'ellipse',
            center: { x: 3, y: -2 },
            major: { x: 10 * Math.cos(turn), y: 10 * Math.sin(turn) },
            minor: 4,
          },
        ]),
        1,
      ),
    );
    // Every point along its bottom edge satisfies the ellipse's equation, to float precision. Its
    // cap's area is checked loosely: OCCT integrates a B-spline face numerically, about 2e-4 off.
    const edges = expectOk(await kernel.extractEdges(solid)).positions;
    let worst = 0;
    for (let i = 0; i + 2 < edges.length; i += 3) {
      if (Math.abs(edges[i + 2] ?? 1) > 1e-6) continue;
      const dx = (edges[i] ?? 0) - 3;
      const dy = (edges[i + 1] ?? 0) + 2;
      const along = dx * Math.cos(turn) + dy * Math.sin(turn);
      const across = -dx * Math.sin(turn) + dy * Math.cos(turn);
      worst = Math.max(worst, Math.abs((along / 10) ** 2 + (across / 4) ** 2 - 1));
    }
    expect(worst).toBeLessThan(1e-5);
    expect((await capArea(solid)) / (Math.PI * 10 * 4)).toBeCloseTo(1, 3);
  });

  it('extrudes a closed chain of Bézier pieces', async () => {
    // Four quarter circles, each as the usual cubic Bézier (handle length 0.5523 of the radius).
    const k = 0.5522847498 * 5;
    const poles = [
      { x: 5, y: 0 },
      { x: 5, y: k },
      { x: k, y: 5 },
      { x: 0, y: 5 },
      { x: -k, y: 5 },
      { x: -5, y: k },
      { x: -5, y: 0 },
      { x: -5, y: -k },
      { x: -k, y: -5 },
      { x: 0, y: -5 },
      { x: k, y: -5 },
      { x: 5, y: -k },
      { x: 5, y: 0 },
    ];
    const solid = expectOk(await kernel.extrude(onXY([{ kind: 'spline', poles }]), 1));
    expect((await capArea(solid)) / (Math.PI * 25)).toBeCloseTo(1, 3);
  });

  it('closes a spline with a line into one area', async () => {
    const solid = expectOk(
      await kernel.extrude(
        onXY([
          { kind: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
          {
            kind: 'spline',
            poles: [
              { x: 10, y: 0 },
              { x: 10, y: 5 },
              { x: 0, y: 5 },
              { x: 0, y: 0 },
            ],
          },
        ]),
        1,
      ),
    );
    // The cubic with those poles and the line enclose 3/5 of the 10 × 5 box: 30.
    expect(await capArea(solid)).toBeCloseTo(30, 1);
  });
});

describe('a part of an ellipse', () => {
  it('closes with a line into a half ellipse of half the area', async () => {
    const kernel = await createOcctKernel();
    const solid = expectOk(
      await kernel.extrude(
        onXY([
          {
            kind: 'ellipse',
            center: { x: 0, y: 0 },
            major: { x: 10, y: 0 },
            minor: 4,
            from: 0,
            sweep: Math.PI,
          },
          { kind: 'line', start: { x: -10, y: 0 }, end: { x: 10, y: 0 } },
        ]),
        1,
      ),
    );
    const faces = expectOk(await kernel.subShapes(solid, 'face'));
    const tops = expectOk(await kernel.measureFaces(faces)).filter(
      (face) => Math.abs(face.centre.z - 1) < 1e-6,
    );
    expect((tops[0]?.area ?? 0) / (Math.PI * 20)).toBeCloseTo(1, 3);
  }, 120_000);
});
