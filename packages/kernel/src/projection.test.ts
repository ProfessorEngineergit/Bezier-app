/** HLR regressions on the real B-Rep kernel, including a hollow part. */
import { beforeAll, expect, it } from 'vitest';
import type { KernelResult } from './errors.js';
import type { GeometryKernel, Profile } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';

let kernel: GeometryKernel;
beforeAll(async () => {
  kernel = await createOcctKernel();
}, 120000);
const unwrap = <T>(r: KernelResult<T>): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
it('projects a box in true millimetres with hidden edges and releases temporary HLR shapes', async () => {
  const points = [
    [0, 0],
    [40, 0],
    [40, 60],
    [0, 60],
    [0, 0],
  ];
  const profile: Profile = {
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    xDirection: { x: 1, y: 0, z: 0 },
    loops: [
      points.slice(0, -1).map((p, i) => ({
        kind: 'line',
        start: { x: p[0] ?? 0, y: p[1] ?? 0 },
        end: { x: points[i + 1]?.[0] ?? 0, y: points[i + 1]?.[1] ?? 0 },
      })),
    ],
  };
  const shape = unwrap(await kernel.extrude(profile, 15));
  const count = await kernel.liveShapeCount();
  for (const direction of ['front', 'top', 'right', 'isometric'] as const) {
    const projection = unwrap(await kernel.projectDrawing(shape, direction));
    expect(projection.visible.length).toBeGreaterThan(0);
    expect(projection.hidden.length).toBeGreaterThan(0);
    expect(projection.visible.flat().every(Number.isFinite)).toBe(true);
    if (direction === 'top') {
      const x = projection.visible.flatMap((l) => l.filter((_, i) => i % 2 === 0));
      const y = projection.visible.flatMap((l) => l.filter((_, i) => i % 2 === 1));
      expect(Math.max(...x) - Math.min(...x)).toBeCloseTo(40, 5);
      expect(Math.max(...y) - Math.min(...y)).toBeCloseTo(60, 5);
    }
  }
  expect(await kernel.liveShapeCount()).toBe(count);
  await kernel.dispose(shape);
});

const rectangle = (x0: number, y0: number, x1: number, y1: number, z: number): Profile => {
  const corners = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  return {
    origin: { x: 0, y: 0, z },
    normal: { x: 0, y: 0, z: 1 },
    xDirection: { x: 1, y: 0, z: 0 },
    loops: [
      corners.map((p, i) => {
        const q = corners[(i + 1) % corners.length] ?? p;
        return {
          kind: 'line',
          start: { x: p[0] ?? 0, y: p[1] ?? 0 },
          end: { x: q[0] ?? 0, y: q[1] ?? 0 },
        };
      }),
    ],
  };
};

const segments = (lines: number[][]) =>
  lines.flatMap((l) => {
    const out: [number, number, number, number][] = [];
    for (let i = 0; i + 3 < l.length; i += 2)
      out.push([l[i] ?? 0, l[i + 1] ?? 0, l[i + 2] ?? 0, l[i + 3] ?? 0]);
    return out;
  });

it('draws each view from its own side, upright, with a raised block where it belongs', async () => {
  // A 40 × 60 × 15 plate with a 10 mm cube on its front-left corner.
  const plate = unwrap(await kernel.extrude(rectangle(0, 0, 40, 60, 0), 15));
  const block = unwrap(await kernel.extrude(rectangle(0, 0, 10, 10, 15), 10));
  const part = unwrap(await kernel.fuse(plate, block)).shape;

  // Front: 25 mm tall, the cube's top edge over the plate's left 10 mm.
  const front = unwrap(await kernel.projectDrawing(part, 'front'));
  const fx = front.visible.flat().filter((_, i) => i % 2 === 0);
  const fy = front.visible.flat().filter((_, i) => i % 2 === 1);
  expect(Math.max(...fx) - Math.min(...fx)).toBeCloseTo(40, 5);
  expect(Math.max(...fy) - Math.min(...fy)).toBeCloseTo(25, 5);
  const high = Math.max(...fy);
  const cubeTop = segments(front.visible).filter(
    ([, y0, , y1]) => Math.abs(y0 - high) < 1e-6 && Math.abs(y1 - high) < 1e-6,
  );
  expect(cubeTop.length).toBeGreaterThan(0);
  for (const [x0, , x1] of cubeTop)
    expect(Math.max(x0, x1)).toBeLessThanOrEqual(Math.min(...fx) + 10 + 1e-6);

  // Top, seen from above: the cube's right side at x = 10 is in sight (from below it would
  // be hidden) and sits at the front, the bottom of the plan.
  const top = unwrap(await kernel.projectDrawing(part, 'top'));
  const tx = top.visible.flat().filter((_, i) => i % 2 === 0);
  const ty = top.visible.flat().filter((_, i) => i % 2 === 1);
  const side = segments(top.visible).filter(
    ([x0, , x1]) =>
      Math.abs(x0 - Math.min(...tx) - 10) < 1e-6 && Math.abs(x1 - Math.min(...tx) - 10) < 1e-6,
  );
  expect(side.length).toBeGreaterThan(0);
  for (const [, y0, , y1] of side)
    expect(Math.max(y0, y1)).toBeLessThanOrEqual(Math.min(...ty) + 10 + 1e-6);

  // Right, seen from +X: 60 mm deep and 25 mm tall, nothing flattened.
  const right = unwrap(await kernel.projectDrawing(part, 'right'));
  const rx = right.visible.flat().filter((_, i) => i % 2 === 0);
  const ry = right.visible.flat().filter((_, i) => i % 2 === 1);
  expect(Math.max(...rx) - Math.min(...rx)).toBeCloseTo(60, 5);
  expect(Math.max(...ry) - Math.min(...ry)).toBeCloseTo(25, 5);

  for (const shape of [part, block, plate]) await kernel.dispose(shape);
});

it('carries exact model vertices through an isometric projection with full 3D length', async () => {
  const shape = unwrap(await kernel.extrude(rectangle(0, 0, 40, 60, 0), 15));
  const before = await kernel.liveShapeCount();
  const iso = unwrap(await kernel.projectDrawing(shape, 'isometric'));
  const a = iso.vertices?.find((v) => Math.hypot(v.world.x, v.world.y, v.world.z) < 1e-6);
  const b = iso.vertices?.find((v) => Math.hypot(v.world.x - 40, v.world.y, v.world.z) < 1e-6);
  if (!a || !b) throw new Error('Exact box vertices were not projected');
  expect(Math.hypot(b.point[0] - a.point[0], b.point[1] - a.point[1])).toBeCloseTo(
    40 * Math.sqrt(2 / 3),
  );
  expect(Math.hypot(b.world.x - a.world.x, b.world.y - a.world.y, b.world.z - a.world.z)).toBe(40);
  expect(await kernel.liveShapeCount()).toBe(before);
  await kernel.dispose(shape);
});
