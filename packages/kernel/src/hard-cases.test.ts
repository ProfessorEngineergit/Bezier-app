/**
 * Known hard cases (cross hole through a rod, revolve about a profile edge, groove round a side
 * opening, rounds on edges ending in curves), against the real kernel. Volumes are checked, so a
 * valid but wrong solid fails too.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { KernelResult } from './errors.js';
import type { GeometryKernel, Profile } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';
import type { ShapeId } from './types.js';

function ok<T>(r: KernelResult<T>): T {
  if (!r.ok) throw new Error(`${r.error.message}: ${r.error.detail}`);
  return r.value;
}

const onXY = (loop: Profile['loops'][number], z = 0): Profile => ({
  loops: [loop],
  origin: { x: 0, y: 0, z },
  normal: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
});

const rectangle = (x0: number, y0: number, x1: number, y1: number) =>
  [
    { kind: 'line' as const, start: { x: x0, y: y0 }, end: { x: x1, y: y0 } },
    { kind: 'line' as const, start: { x: x1, y: y0 }, end: { x: x1, y: y1 } },
    { kind: 'line' as const, start: { x: x1, y: y1 }, end: { x: x0, y: y1 } },
    { kind: 'line' as const, start: { x: x0, y: y1 }, end: { x: x0, y: y0 } },
  ] satisfies Profile['loops'][number];

describe('cases other CAD systems are said to break on', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, 120_000);

  /** Signed volume from the mesh: negative would be a solid sewn inside out. */
  async function volume(shape: ShapeId): Promise<number> {
    const mesh = ok(await kernel.tessellate(shape));
    const p = mesh.positions;
    let total = 0;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = (mesh.indices[i] ?? 0) * 3;
      const b = (mesh.indices[i + 1] ?? 0) * 3;
      const c = (mesh.indices[i + 2] ?? 0) * 3;
      const [ax, ay, az] = [p[a] ?? 0, p[a + 1] ?? 0, p[a + 2] ?? 0];
      const [bx, by, bz] = [p[b] ?? 0, p[b + 1] ?? 0, p[b + 2] ?? 0];
      const [cx, cy, cz] = [p[c] ?? 0, p[c + 1] ?? 0, p[c + 2] ?? 0];
      total += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    return total;
  }

  it('drills a cross hole through a rod, off its middle and through both walls', async () => {
    const rod = ok(
      await kernel.extrude(onXY([{ kind: 'circle', center: { x: 0, y: 0 }, radius: 4 }]), 40),
    );
    const before = await volume(rod);
    const drill = ok(
      await kernel.extrude(
        {
          loops: [[{ kind: 'circle', center: { x: 0, y: 0 }, radius: 1.5 }]],
          origin: { x: -10, y: 0, z: 17 },
          normal: { x: 1, y: 0, z: 0 },
          xDirection: { x: 0, y: 1, z: 0 },
        },
        20,
      ),
    );
    const cut = ok(await kernel.cut(rod, drill));
    const after = await volume(cut.shape);
    const removed = before - after;
    // The drill is shorter inside the rod than the full chord, and longer than the chord at its edge.
    const r2 = 1.5 * 1.5;
    expect(removed).toBeGreaterThan(Math.PI * r2 * 2 * Math.sqrt(16 - r2));
    expect(removed).toBeLessThan(Math.PI * r2 * 2 * 4);
    expect(ok(await kernel.bounds(cut.shape)).max.z).toBeCloseTo(40);
  });

  it('revolves a profile about an edge of itself, whole and by half', async () => {
    const whole = ok(
      await kernel.revolve(
        onXY(rectangle(3, 0, 13, 5)),
        { x: 3, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        2 * Math.PI,
      ),
    );
    // A mesh sits inside a curved surface, so the volume is compared within one percent.
    expect((await volume(whole)) / (Math.PI * 100 * 5)).toBeCloseTo(1, 2);
    const half = ok(
      await kernel.revolve(
        onXY(rectangle(3, 0, 13, 5)),
        { x: 3, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        Math.PI,
      ),
    );
    expect((await volume(half)) / ((Math.PI * 100 * 5) / 2)).toBeCloseTo(1, 2);
  });

  it('cuts a square ring round an opening on the side of a cylinder', async () => {
    const cylinder = ok(
      await kernel.extrude(onXY([{ kind: 'circle', center: { x: 0, y: 0 }, radius: 10 }]), 40),
    );
    const opening = ok(
      await kernel.extrude(
        {
          loops: [[{ kind: 'circle', center: { x: 0, y: 0 }, radius: 3 }]],
          origin: { x: 0, y: 0, z: 20 },
          normal: { x: 1, y: 0, z: 0 },
          xDirection: { x: 0, y: 1, z: 0 },
        },
        15,
      ),
    );
    const bored = ok(await kernel.cut(cylinder, opening));
    const boredVolume = await volume(bored.shape);
    // The ring: radial 3 to 5 about the opening's axis, along it from 8 to 12, crossing the surface.
    const ring = ok(
      await kernel.revolve(
        onXY(rectangle(8, 3, 12, 5), 20),
        { x: 0, y: 0, z: 20 },
        { x: 1, y: 0, z: 0 },
        2 * Math.PI,
      ),
    );
    const grooved = ok(await kernel.cut(bored.shape, ring));
    const removed = boredVolume - (await volume(grooved.shape));
    expect(removed).toBeGreaterThan(0);
    // Never more than the whole ring would be if it lay inside the material.
    expect(removed).toBeLessThan(Math.PI * (25 - 9) * 4);
    // Both walls are still there.
    expect(ok(await kernel.bounds(grooved.shape)).max.x).toBeCloseTo(10);
  });

  it('rounds the top edges of a D-shaped block, where straight edges end in a curve', async () => {
    const d: Profile['loops'][number] = [
      { kind: 'line', start: { x: 0, y: 0 }, end: { x: 20, y: 0 } },
      { kind: 'arc', start: { x: 20, y: 0 }, mid: { x: 30, y: 10 }, end: { x: 20, y: 20 } },
      { kind: 'line', start: { x: 20, y: 20 }, end: { x: 0, y: 20 } },
      { kind: 'line', start: { x: 0, y: 20 }, end: { x: 0, y: 0 } },
    ];
    const block = ok(await kernel.extrude(onXY(d), 10));
    const before = await volume(block);
    const faces = ok(await kernel.subShapes(block, 'face'));
    const measured = ok(await kernel.measureFaces(faces));
    const topIndex = measured.findIndex((m) => Math.abs(m.centre.z - 10) < 1e-6 && m.area > 100);
    const top = faces[topIndex] as ShapeId;
    const edges = ok(await kernel.subShapes(top, 'edge'));
    expect(edges).toHaveLength(4);
    const rounded = ok(await kernel.fillet(block, edges, 1));
    const after = await volume(rounded.shape);
    // A round of radius r along an edge of length L removes (1 - π/4) r² L.
    const length = 20 + 20 + 20 + Math.PI * 10;
    expect(before - after).toBeCloseTo((1 - Math.PI / 4) * length, 0);
  });

  it('winds a square profile round an axis while it climbs: a thread (audit F-018)', async () => {
    const square: Profile = {
      loops: [rectangle(10, 0, 12, 2)],
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: -1, z: 0 },
      xDirection: { x: 1, y: 0, z: 0 },
    };
    const thread = ok(
      await kernel.revolve(square, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 6 * Math.PI, 5),
    );
    expect(ok(await kernel.solidFaceGroups(thread))).toHaveLength(1);
    const box = ok(await kernel.bounds(thread));
    // Three turns of 5 mm, and the profile's own 2 mm on top; out to the profile's far side.
    expect(box.max.z - box.min.z).toBeCloseTo(17, 3);
    expect(box.max.x).toBeCloseTo(12, 3);
  });
});
