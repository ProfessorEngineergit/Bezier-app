/**
 * OCCT behaviour on a body of several solids (ADR 0012), against the real kernel: which operations
 * leave untouched solids alone, and which do not work on a compound.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { FaceHash, KernelResult, ShapeId } from './index.js';
import type { GeometryKernel, Profile } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';

const LOAD_TIMEOUT_MS = 120_000;

function expectOk<T>(result: KernelResult<T>): T {
  if (!result.ok) throw new Error(`kernel refused: [${result.error.code}] ${result.error.message}`);
  return result.value;
}

function square(x0: number, y0: number, x1: number, y1: number, z = 0): Profile {
  return {
    loops: [
      [
        { kind: 'line', start: { x: x0, y: y0 }, end: { x: x1, y: y0 } },
        { kind: 'line', start: { x: x1, y: y0 }, end: { x: x1, y: y1 } },
        { kind: 'line', start: { x: x1, y: y1 }, end: { x: x0, y: y1 } },
        { kind: 'line', start: { x: x0, y: y1 }, end: { x: x0, y: y0 } },
      ],
    ],
    origin: { x: 0, y: 0, z },
    normal: { x: 0, y: 0, z: 1 },
    xDirection: { x: 1, y: 0, z: 0 },
  };
}

describe('a body made of several solids', () => {
  let kernel: GeometryKernel;
  /** Two boxes touching side by side, and a third standing apart. */
  let body: ShapeId;
  let apart: ShapeId;
  let untouched: readonly FaceHash[];

  beforeAll(async () => {
    kernel = await createOcctKernel();
    const left = expectOk(await kernel.extrude(square(0, 0, 10, 10), 10));
    const right = expectOk(await kernel.extrude(square(10, 0, 20, 10), 10));
    apart = expectOk(await kernel.extrude(square(50, 0, 60, 10), 10));
    const pair = expectOk(await kernel.compound(left, right));
    body = expectOk(await kernel.compound(pair.shape, apart)).shape;
    const groups = expectOk(await kernel.solidFaceGroups(pair.shape));
    untouched = groups.flat();
  }, LOAD_TIMEOUT_MS);

  const solids = async (shape: ShapeId) => expectOk(await kernel.solidFaceGroups(shape)).length;

  it('is three solids, the two touching ones included', async () => {
    expect(await solids(body)).toBe(3);
  });

  it('joins a tool to the solid it touches and leaves the other two alone', async () => {
    const tool = expectOk(await kernel.extrude(square(55, 5, 65, 15), 5));
    const joined = expectOk(await kernel.fuse(body, tool));
    expect(await solids(joined.shape)).toBe(3);
    for (const hash of untouched) expect(joined.evolution.unchanged).toContain(hash);
  });

  it('cuts only the solid the tool reaches', async () => {
    const tool = expectOk(await kernel.extrude(square(52, 2, 58, 8, -5), 20));
    const cut = expectOk(await kernel.cut(body, tool));
    expect(await solids(cut.shape)).toBe(3);
    for (const hash of untouched) expect(cut.evolution.unchanged).toContain(hash);
  });

  it('rounds and bevels an edge of one solid without touching the others', async () => {
    const edges = expectOk(await kernel.subShapes(apart, 'edge'));
    const edge = edges[0];
    if (edge === undefined) throw new Error('the box has no edges');
    const rounded = expectOk(await kernel.fillet(body, [edge], 1));
    expect(await solids(rounded.shape)).toBe(3);
    for (const hash of untouched) expect(rounded.evolution.unchanged).toContain(hash);
    const bevelled = expectOk(await kernel.chamfer(body, [edge], 1));
    expect(await solids(bevelled.shape)).toBe(3);
  });

  it('joins two existing bodies and follows the faces of both', async () => {
    const target = expectOk(await kernel.extrude(square(0, 0, 10, 10), 10));
    const tool = expectOk(await kernel.extrude(square(5, 5, 15, 15, 5), 10));
    const toolFaces = expectOk(await kernel.describeFaces(tool)).map((face) => face.hash);
    const plain = expectOk(await kernel.fuse(target, tool));
    const joined = expectOk(await kernel.combine('fuse', target, tool));
    const traced = (evolution: typeof joined.evolution) => [
      ...evolution.unchanged,
      ...evolution.modified.map((entry) => entry.from),
    ];
    // A plain fuse forgets where the tool's faces went; a combine does not.
    expect(traced(plain.evolution).some((hash) => toolFaces.includes(hash))).toBe(false);
    for (const hash of toolFaces) expect(traced(joined.evolution)).toContain(hash);
    expect(await solids(joined.shape)).toBe(1);
  });

  it('never claims a tool face the cut threw away', async () => {
    const target = expectOk(await kernel.extrude(square(0, 0, 10, 10), 10));
    const tool = expectOk(await kernel.extrude(square(5, 5, 15, 15, 5), 10));
    const cut = expectOk(await kernel.combine('cut', target, tool));
    const present = new Set(expectOk(await kernel.describeFaces(cut.shape)).map((f) => f.hash));
    for (const hash of cut.evolution.unchanged) expect(present.has(hash)).toBe(true);
    const common = expectOk(await kernel.combine('intersect', target, tool));
    expect(await solids(common.shape)).toBe(1);
  });

  it('cannot hollow a compound, but hollows the solid that owns the face', async () => {
    const faces = expectOk(await kernel.subShapes(apart, 'face'));
    const face = faces[0];
    if (face === undefined) throw new Error('the box has no faces');
    // Why core shells the owning solid and not the whole body.
    expect((await kernel.shell(body, [face], 1)).ok).toBe(false);
    const owner = expectOk(await kernel.partition(body, [face]));
    expect(owner.remainder).not.toBeNull();
    const hollow = expectOk(await kernel.shell(owner.selected, [face], 1));
    expect(await solids(hollow.shape)).toBe(1);
  });
});

describe('a profile with holes', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, LOAD_TIMEOUT_MS);

  const outline = square(0, 0, 40, 40).loops[0] ?? [];

  it('extrudes a square with a round hole as a ring', async () => {
    const profile: Profile = {
      ...square(0, 0, 40, 40),
      loops: [outline, [{ kind: 'circle', center: { x: 20, y: 20 }, radius: 5 }]],
    };
    const ring = expectOk(await kernel.extrude(profile, 10));
    const faces = expectOk(await kernel.describeFaces(ring));
    // Four sides, top, bottom, and the bore.
    expect(faces).toHaveLength(7);
    expect(faces.filter((face) => face.surfaceType === 'cylinder')).toHaveLength(1);
  });

  it('takes a hole whichever way round it was traced', async () => {
    const clockwise = [...(square(10, 10, 30, 30).loops[0] ?? [])]
      .reverse()
      .map((segment) =>
        segment.kind === 'line' ? { ...segment, start: segment.end, end: segment.start } : segment,
      );
    for (const hole of [square(10, 10, 30, 30).loops[0] ?? [], clockwise]) {
      const frame = expectOk(
        await kernel.extrude({ ...square(0, 0, 40, 40), loops: [outline, hole] }, 5),
      );
      expect(expectOk(await kernel.describeFaces(frame))).toHaveLength(10);
    }
  });
});

describe('how bodies meet, split and scale', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, LOAD_TIMEOUT_MS);

  it('tells apart, touching and overlapping bodies apart', async () => {
    const a = expectOk(await kernel.extrude(square(0, 0, 10, 10), 10));
    const beside = expectOk(await kernel.extrude(square(10, 0, 20, 10), 10));
    const across = expectOk(await kernel.extrude(square(5, 5, 15, 15), 10));
    const away = expectOk(await kernel.extrude(square(40, 0, 50, 10), 10));
    expect(expectOk(await kernel.contact(a, beside))).toBe('touching');
    expect(expectOk(await kernel.contact(a, across))).toBe('overlapping');
    expect(expectOk(await kernel.contact(a, away))).toBe('apart');
  });

  it('splits a box into two parts and keeps the untouched faces', async () => {
    const box = expectOk(await kernel.extrude(square(0, 0, 10, 10), 20));
    const before = expectOk(await kernel.describeFaces(box));
    const split = expectOk(
      await kernel.splitByPlane(box, { x: 0, y: 0, z: 12 }, { x: 0, y: 0, z: 1 }),
    );
    expect(expectOk(await kernel.solidFaceGroups(split.shape))).toHaveLength(2);
    // Top and bottom are whole on one side each; the four walls are cut in two.
    const top = before.filter((face) => split.evolution.unchanged.includes(face.hash));
    expect(top).toHaveLength(2);
    expect(split.evolution.modified).toHaveLength(4);
    for (const entry of split.evolution.modified) expect(entry.to).toHaveLength(2);
    const lower = expectOk(await kernel.bounds(split.shape));
    expect(lower.max.z).toBeCloseTo(20, 6);
  });

  it('refuses a plane that misses the body', async () => {
    const box = expectOk(await kernel.extrude(square(0, 0, 10, 10), 20));
    const missed = await kernel.splitByPlane(box, { x: 0, y: 0, z: 50 }, { x: 0, y: 0, z: 1 });
    expect(missed.ok).toBe(false);
  });

  it('scales a box about a point, keeping every face', async () => {
    const box = expectOk(await kernel.extrude(square(0, 0, 10, 10), 10));
    const faces = expectOk(await kernel.describeFaces(box)).map((face) => face.hash);
    const bigger = expectOk(await kernel.scale(box, { x: 5, y: 5, z: 5 }, 2));
    const bounds = expectOk(await kernel.bounds(bigger.shape));
    expect(bounds.min.x).toBeCloseTo(-5, 6);
    expect(bounds.max.z).toBeCloseTo(15, 6);
    const traced = [
      ...bigger.evolution.unchanged,
      ...bigger.evolution.modified.map((entry) => entry.from),
    ];
    for (const hash of faces) expect(traced).toContain(hash);
  });
});

describe('display of a body made of several solids', () => {
  let kernel: GeometryKernel;
  let body: ShapeId;

  beforeAll(async () => {
    kernel = await createOcctKernel();
    const left = expectOk(await kernel.extrude(square(0, 0, 10, 10), 10));
    const right = expectOk(await kernel.extrude(square(10, 0, 20, 10), 10));
    const apart = expectOk(await kernel.extrude(square(50, 0, 60, 10), 10));
    const pair = expectOk(await kernel.compound(left, right));
    body = expectOk(await kernel.compound(pair.shape, apart)).shape;
  }, LOAD_TIMEOUT_MS);

  /**
   * Every face checked by where its triangles lie: their area-weighted centre must be the
   * face's own centre. A mesh whose face numbers drift by one solid would put every click on
   * the wrong face.
   */
  const expectTrianglesOnTheirFaces = async (shape: ShapeId, faceCount: number) => {
    const mesh = expectOk(await kernel.tessellate(shape));
    const faces = expectOk(await kernel.describeFaces(shape));
    const measured = expectOk(await kernel.measureFaces(faces.map((face) => face.id)));
    const sums = faces.map(() => ({ area: 0, x: 0, y: 0, z: 0 }));
    const point = (vertex: number) => ({
      x: mesh.positions[vertex * 3] ?? 0,
      y: mesh.positions[vertex * 3 + 1] ?? 0,
      z: mesh.positions[vertex * 3 + 2] ?? 0,
    });
    for (let t = 0; t < mesh.triangleFaces.length; t++) {
      const [a, b, c] = [0, 1, 2].map((k) => point(mesh.indices[t * 3 + k] ?? 0));
      if (a === undefined || b === undefined || c === undefined) continue;
      const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
      const area =
        Math.hypot(u.y * v.z - u.z * v.y, u.z * v.x - u.x * v.z, u.x * v.y - u.y * v.x) / 2;
      const sum = sums[mesh.triangleFaces[t] ?? -1];
      if (sum === undefined) throw new Error(`triangle ${t} names no face`);
      sum.area += area;
      sum.x += (area * (a.x + b.x + c.x)) / 3;
      sum.y += (area * (a.y + b.y + c.y)) / 3;
      sum.z += (area * (a.z + b.z + c.z)) / 3;
    }
    expect(faces.length).toBe(faceCount);
    sums.forEach((sum, index) => {
      const centre = measured[index]?.centre;
      expect(sum.area).toBeGreaterThan(0);
      expect(sum.x / sum.area).toBeCloseTo(centre?.x ?? Number.NaN, 6);
      expect(sum.y / sum.area).toBeCloseTo(centre?.y ?? Number.NaN, 6);
      expect(sum.z / sum.area).toBeCloseTo(centre?.z ?? Number.NaN, 6);
    });
  };

  it('describes an unchanged solid once, handing out the same faces again', async () => {
    const before = expectOk(await kernel.describeFaces(body));
    const added = expectOk(await kernel.extrude(square(-30, 0, -20, 10), 10));
    const after = expectOk(
      await kernel.describeFaces(expectOk(await kernel.compound(added, body)).shape),
    );
    // The new solid's six faces are new; the eighteen of the old ones are the same.
    expect(after).toHaveLength(24);
    const reused = after.filter((face) => before.some((old) => old.id === face.id));
    expect(reused).toHaveLength(18);
    for (const face of reused) {
      expect(face.hash).toBe(before.find((old) => old.id === face.id)?.hash);
    }
  });

  it('lists face hashes in the order describeFaces does, without handles', async () => {
    const described = expectOk(await kernel.describeFaces(body)).map((face) => face.hash);
    expect(expectOk(await kernel.faceHashes(body))).toEqual(described);
  });

  it('meshes solid by solid, each triangle on the face describeFaces names', async () => {
    await expectTrianglesOnTheirFaces(body, 18);
  });

  it('reuses the meshes of unchanged solids without mixing up their faces', async () => {
    // Twice on the same body: the second time every solid comes from the cache.
    await expectTrianglesOnTheirFaces(body, 18);
    // A new solid put first: every cached solid's faces move to new positions, which is what
    // a reused piece has to be renumbered for.
    const added = expectOk(await kernel.extrude(square(-30, 0, -20, 10), 10));
    const both = expectOk(await kernel.compound(added, body)).shape;
    await expectTrianglesOnTheirFaces(both, 24);
  });

  it('reuses the outlines of unchanged solids, each still where it belongs', async () => {
    const first = expectOk(await kernel.extractEdges(body));
    const again = expectOk(await kernel.extractEdges(body));
    expect(Array.from(again.positions)).toEqual(Array.from(first.positions));
    expect(Array.from(again.polylineStarts)).toEqual(Array.from(first.polylineStarts));
    const added = expectOk(await kernel.extrude(square(-30, 0, -20, 10), 10));
    const both = expectOk(
      await kernel.extractEdges(expectOk(await kernel.compound(added, body)).shape),
    );
    expect(both.polylineStarts.length).toBe(48);
    // Every polyline starts inside the float array and on a point boundary.
    for (const start of both.polylineStarts) {
      expect(start % 3).toBe(0);
      expect(start).toBeLessThan(both.positions.length);
    }
    let nearest = Number.POSITIVE_INFINITY;
    let furthest = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < both.positions.length; i += 3) {
      nearest = Math.min(nearest, both.positions[i] ?? 0);
      furthest = Math.max(furthest, both.positions[i] ?? 0);
    }
    expect(nearest).toBeCloseTo(-30, 6);
    expect(furthest).toBeCloseTo(60, 6);
  });

  it('draws the outlines of every solid, not only the first', async () => {
    const edges = expectOk(await kernel.extractEdges(body));
    // Three boxes, twelve edges each.
    expect(edges.polylineStarts.length).toBe(36);
    let furthest = 0;
    for (let i = 0; i < edges.positions.length; i += 3) {
      furthest = Math.max(furthest, edges.positions[i] ?? 0);
    }
    expect(furthest).toBeCloseTo(60, 6);
  });
});
