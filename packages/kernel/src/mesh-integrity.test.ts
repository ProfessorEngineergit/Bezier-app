/**
 * Meshes of every kind of solid the app makes, at the app's settings, checked against the solid:
 * no missing faces, closed surfaces, matching volume. OCCT's mesher silently skips some faces
 * (`mesh-mend.ts`). Real kernel.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { KernelResult } from './errors.js';
import type { GeometryKernel, Profile, ProfileSegment } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';
import type { Mesh, ShapeId, TessellationOptions } from './types.js';

function ok<T>(r: KernelResult<T>): T {
  if (!r.ok) throw new Error(`${r.error.message}: ${r.error.detail}`);
  return r.value;
}

const onXY = (loops: readonly (readonly ProfileSegment[])[], z = 0): Profile => ({
  loops,
  origin: { x: 0, y: 0, z },
  normal: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
});

const line = (x0: number, y0: number, x1: number, y1: number): ProfileSegment => ({
  kind: 'line',
  start: { x: x0, y: y0 },
  end: { x: x1, y: y1 },
});

const rect = (x0: number, y0: number, x1: number, y1: number): ProfileSegment[] => [
  line(x0, y0, x1, y0),
  line(x1, y0, x1, y1),
  line(x1, y1, x0, y1),
  line(x0, y1, x0, y0),
];

const circle = (r: number, cx = 0, cy = 0): ProfileSegment => ({
  kind: 'circle',
  center: { x: cx, y: cy },
  radius: r,
});

/** The settings the app meshes at: its default and the three export qualities. */
const SETTINGS: TessellationOptions[] = [
  { linearDeflection: 0.2, angularDeflection: 0.5 },
  { linearDeflection: 0.1, angularDeflection: 0.5 },
  { linearDeflection: 0.02, angularDeflection: 0.25 },
  { linearDeflection: 0.005, angularDeflection: 0.1 },
];

function openEdges(mesh: Mesh, scale: number): number {
  const unit = 1e-4 * scale;
  const count = (shift: number): Set<string> => {
    const ids = new Map<string, number>();
    const idOf = (v: number): number => {
      const key = [0, 1, 2]
        .map((o) => Math.round((mesh.positions[v * 3 + o] ?? 0) / unit + shift))
        .join(',');
      const known = ids.get(key);
      if (known !== undefined) return known;
      ids.set(key, ids.size);
      return ids.size - 1;
    };
    const uses = new Map<string, number>();
    const where = new Map<string, string>();
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const raw = [0, 1, 2].map((o) => mesh.indices[t + o] ?? 0);
      const v = raw.map(idOf);
      for (const [i, j] of [
        [0, 1],
        [1, 2],
        [2, 0],
      ] as const) {
        const p = v[i] ?? 0;
        const q = v[j] ?? 0;
        // A triangle that collapses to a point at a cone's tip has an edge from a point to itself.
        if (p === q) continue;
        const key = p < q ? `${p}_${q}` : `${q}_${p}`;
        uses.set(key, (uses.get(key) ?? 0) + 1);
        where.set(key, `${raw[i]}_${raw[j]}`);
      }
    }
    const open = new Set<string>();
    for (const [key, n] of uses) if (n === 1) open.add(where.get(key) ?? key);
    return open;
  };
  // Open only if it is open on two grids half a cell apart: one grid calls two points a rounding
  // error apart different whenever they straddle a cell boundary.
  const a = count(0);
  const b = count(0.5);
  let open = 0;
  for (const edge of a) if (b.has(edge)) open++;
  return open;
}

function meshVolume(mesh: Mesh): number {
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

describe('every solid the app makes meshes whole', { timeout: 240_000 }, () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, 120_000);

  async function box(x: number, y: number, z: number, at = 0): Promise<ShapeId> {
    return ok(await kernel.extrude(onXY([rect(at, at, at + x, at + y)]), z));
  }

  const cases: [string, () => Promise<ShapeId>][] = [
    ['a box', () => box(20, 10, 5)],
    ['a cylinder', async () => ok(await kernel.extrude(onXY([[circle(5)]]), 12))],
    [
      'a cone, closing to a point',
      async () =>
        ok(
          await kernel.revolve(
            onXY([[line(0, 0, 6, 0), line(6, 0, 0, 10), line(0, 10, 0, 0)]]),
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
            2 * Math.PI,
          ),
        ),
    ],
    [
      'a half cone, closing to a point',
      async () =>
        ok(
          await kernel.revolve(
            onXY([[line(0, 0, 6, 0), line(6, 0, 0, 10), line(0, 10, 0, 0)]]),
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
            Math.PI,
          ),
        ),
    ],
    [
      'a sphere',
      async () =>
        ok(
          await kernel.revolve(
            onXY([
              [
                { kind: 'arc', start: { x: 0, y: -5 }, mid: { x: 5, y: 0 }, end: { x: 0, y: 5 } },
                line(0, 5, 0, -5),
              ],
            ]),
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
            2 * Math.PI,
          ),
        ),
    ],
    [
      'a torus',
      async () =>
        ok(
          await kernel.revolve(
            onXY([[circle(2, 8, 0)]]),
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
            2 * Math.PI,
          ),
        ),
    ],
    [
      'a frustum',
      async () =>
        ok(
          await kernel.revolve(
            onXY([[line(0, 0, 6, 0), line(6, 0, 3, 8), line(3, 8, 0, 8), line(0, 8, 0, 0)]]),
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
            2 * Math.PI,
          ),
        ),
    ],
    [
      'a block with leaning walls',
      async () => ok(await kernel.extrude(onXY([rect(0, 0, 20, 12)]), 10, 15)),
    ],
    [
      'a loft from a square to a circle',
      async () => ok(await kernel.loft([onXY([rect(-5, -5, 5, 5)]), onXY([[circle(4)]], 15)])),
    ],
    [
      'a block with every top edge rounded',
      async () => {
        const block = await box(30, 20, 10);
        const top = ok(await kernel.subShapes(block, 'edge'));
        const measured = ok(await kernel.measureFaces(top));
        void measured;
        const edges = [];
        for (const edge of top) {
          const bounds = ok(await kernel.bounds(edge));
          if (Math.abs(bounds.min.z - 10) < 1e-6 && Math.abs(bounds.max.z - 10) < 1e-6) {
            edges.push(edge);
          }
        }
        return ok(await kernel.fillet(block, edges, 2)).shape;
      },
    ],
    [
      'a block with every top edge bevelled',
      async () => {
        const block = await box(30, 20, 10);
        const all = ok(await kernel.subShapes(block, 'edge'));
        const edges = [];
        for (const edge of all) {
          const bounds = ok(await kernel.bounds(edge));
          if (Math.abs(bounds.min.z - 10) < 1e-6 && Math.abs(bounds.max.z - 10) < 1e-6) {
            edges.push(edge);
          }
        }
        return ok(await kernel.chamfer(block, edges, 2)).shape;
      },
    ],
    [
      'a box shelled open at the top',
      async () => {
        const block = await box(30, 20, 10);
        const faces = ok(await kernel.subShapes(block, 'face'));
        const measured = ok(await kernel.measureFaces(faces));
        const top = faces[measured.findIndex((m) => Math.abs(m.centre.z - 10) < 1e-6)] as ShapeId;
        return ok(await kernel.shell(block, [top], 1.5)).shape;
      },
    ],
    [
      'two boxes fused',
      async () => ok(await kernel.fuse(await box(20, 20, 10), await box(20, 20, 10, 10))).shape,
    ],
    [
      'a bore cut through a box',
      async () => {
        const block = await box(30, 30, 10);
        const bore = ok(await kernel.extrude(onXY([[circle(6, 15, 15)]], -2), 20));
        return ok(await kernel.cut(block, bore)).shape;
      },
    ],
    [
      'a box and a cylinder intersected',
      async () => {
        const block = await box(20, 20, 20);
        const round = ok(await kernel.extrude(onXY([[circle(12, 10, 10)]], -2), 30));
        return ok(await kernel.intersect(block, round)).shape;
      },
    ],
    [
      'an extruded ellipse',
      async () =>
        ok(
          await kernel.extrude(
            onXY([[{ kind: 'ellipse', center: { x: 0, y: 0 }, major: { x: 9, y: 0 }, minor: 4 }]]),
            8,
          ),
        ),
    ],
    [
      'an extruded spline blob',
      async () =>
        ok(
          await kernel.extrude(
            onXY([
              [
                {
                  kind: 'spline',
                  poles: [
                    { x: 0, y: 0 },
                    { x: 10, y: -8 },
                    { x: 20, y: 8 },
                    { x: 20, y: 20 },
                    { x: 20, y: 30 },
                    { x: 5, y: 30 },
                    { x: 0, y: 20 },
                    { x: -3, y: 12 },
                    { x: 0, y: 6 },
                    { x: 0, y: 0 },
                  ],
                },
              ],
            ]),
            6,
          ),
        ),
    ],
    [
      'a cylinder standing tangent to the side of a box, fused',
      async () => {
        const block = await box(20, 20, 10);
        const post = ok(await kernel.extrude(onXY([[circle(5, 25, 10)]]), 10));
        return ok(await kernel.fuse(block, post)).shape;
      },
    ],
    [
      'the rim of a cylinder rounded',
      async () => {
        const post = ok(await kernel.extrude(onXY([[circle(8)]]), 12));
        const all = ok(await kernel.subShapes(post, 'edge'));
        const rim = [];
        for (const edge of all) {
          const bounds = ok(await kernel.bounds(edge));
          if (Math.abs(bounds.min.z - 12) < 1e-6 && Math.abs(bounds.max.z - 12) < 1e-6)
            rim.push(edge);
        }
        return ok(await kernel.fillet(post, rim, 2)).shape;
      },
    ],
    [
      'a box stretched along one axis',
      async () => {
        const block = await box(10, 10, 10);
        return ok(await kernel.scale(block, { x: 0, y: 0, z: 0 }, { x: 3, y: 0.5, z: 1 })).shape;
      },
    ],
    [
      'a mirrored cone',
      async () => {
        const cone = ok(
          await kernel.revolve(
            onXY([[line(0, 0, 6, 0), line(6, 0, 0, 10), line(0, 10, 0, 0)]]),
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
            2 * Math.PI,
          ),
        );
        return ok(await kernel.mirror(cone, { x: 10, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).shape;
      },
    ],
    [
      'a circle swept along a bent path',
      async () =>
        ok(
          await kernel.sweep(
            {
              loops: [[circle(2)]],
              origin: { x: 0, y: 0, z: 0 },
              normal: { x: 1, y: 0, z: 0 },
              xDirection: { x: 0, y: 1, z: 0 },
            },
            onXY([
              [
                line(0, 0, 30, 0),
                {
                  kind: 'arc',
                  start: { x: 30, y: 0 },
                  mid: { x: 37.07, y: 2.93 },
                  end: { x: 40, y: 10 },
                },
                line(40, 10, 40, 30),
              ],
            ]),
          ),
        ),
    ],
    [
      'a thread',
      async () =>
        ok(
          await kernel.revolve(
            {
              loops: [rect(10, 0, 12, 2)],
              origin: { x: 0, y: 0, z: 0 },
              normal: { x: 0, y: -1, z: 0 },
              xDirection: { x: 1, y: 0, z: 0 },
            },
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 1 },
            6 * Math.PI,
            5,
          ),
        ),
    ],
    [
      'a box a metre from the origin',
      async () => {
        const block = await box(20, 10, 5);
        return ok(await kernel.translate(block, { x: 100_000, y: -80_000, z: 50_000 })).shape;
      },
    ],
    ['a box of five hundredths of a millimetre', () => box(0.05, 0.03, 0.02)],
    ['a box five metres across', () => box(5000, 3000, 2000)],
    [
      'a box turned to no axis',
      async () => {
        const block = await box(20, 10, 5);
        return ok(await kernel.rotate(block, { x: 3, y: 2, z: 1 }, { x: 1, y: 2, z: 3 }, 0.7))
          .shape;
      },
    ],
  ];

  for (const [name, make] of cases) {
    it(`${name}: written to STEP and read back, it is the same solid`, async () => {
      const solid = await make();
      const before = ok(await kernel.massProperties(solid));
      const faces = ok(await kernel.describeFaces(solid)).length;
      const text = ok(await kernel.exportStep(solid));
      const again = ok(await kernel.importStep(text));
      const after = ok(await kernel.massProperties(again));
      // Exact geometry survives the file; only the last digits of its text are lost.
      expect(after.volume / before.volume).toBeCloseTo(1, 5);
      expect(after.area / before.area).toBeCloseTo(1, 5);
      expect(ok(await kernel.describeFaces(again)).length).toBe(faces);
    });

    it(`${name}: every face meshed, closed, and the right volume`, async () => {
      const solid = await make();
      const faces = ok(await kernel.describeFaces(solid));
      const mass = ok(await kernel.massProperties(solid));
      const size = ok(await kernel.bounds(solid));
      const reach = Math.max(
        size.max.x - size.min.x,
        size.max.y - size.min.y,
        size.max.z - size.min.z,
      );
      for (const setting of SETTINGS) {
        const mesh = ok(await kernel.tessellate(solid, setting));
        const label = `${name} at ${setting.linearDeflection}/${setting.angularDeflection}`;
        // Faces that have an area must have triangles: the mesher drops some without saying so.
        const have = new Set<number>(mesh.triangleFaces);
        const measured = ok(await kernel.measureFaces(ok(await kernel.subShapes(solid, 'face'))));
        const lacking = faces
          .map((_, index) => index)
          .filter(
            (index) => (measured[index]?.area ?? 0) > 1e-6 * reach * reach && !have.has(index),
          );
        expect(lacking, `${label}: faces without triangles`).toEqual([]);
        // Closed: every edge of every triangle is shared, after vertices at one place are one.
        expect(openEdges(mesh, reach), `${label}: open edges`).toBe(0);
        // The volume is the solid's, within what a chord takes off a curve (a mesh sits inside a
        // convex surface and outside a concave one): never a tenth off.
        const volume = meshVolume(mesh);
        expect(volume / mass.volume, `${label}: volume`).toBeGreaterThan(0.9);
        expect(volume / mass.volume, `${label}: volume`).toBeLessThan(1.01);
      }
    });
  }
});
