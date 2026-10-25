/** Moving faces, edges and corners of a real solid: the faces beside them follow, or the move is refused. */
import { expect, it } from 'vitest';
import type { KernelResult } from './errors.js';
import type { GeometryKernel } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';
import type { ShapeId, Vec3 } from './types.js';

function value<T>(r: KernelResult<T>): T {
  if (!r.ok) throw new Error(`${r.error.message}: ${r.error.detail}`);
  return r.value;
}

const rect = (w: number, d: number) => ({
  loops: [
    [
      { kind: 'line' as const, start: { x: 0, y: 0 }, end: { x: w, y: 0 } },
      { kind: 'line' as const, start: { x: w, y: 0 }, end: { x: w, y: d } },
      { kind: 'line' as const, start: { x: w, y: d }, end: { x: 0, y: d } },
      { kind: 'line' as const, start: { x: 0, y: d }, end: { x: 0, y: 0 } },
    ],
  ],
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
});

/** The face whose centre is nearest `at`. */
async function faceAt(kernel: GeometryKernel, body: ShapeId, at: Vec3): Promise<ShapeId> {
  const faces = value(await kernel.describeFaces(body));
  const centres = value(await kernel.measureFaces(faces.map((f) => f.id)));
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  centres.forEach((m, i) => {
    const d = Math.hypot(m.centre.x - at.x, m.centre.y - at.y, m.centre.z - at.z);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return (faces[best] as { id: ShapeId }).id;
}

/** Signed volume from the mesh: negative would be a solid sewn inside out. */
async function volume(kernel: GeometryKernel, body: ShapeId): Promise<number> {
  const mesh = value(await kernel.tessellate(body));
  const at = (vertex: number) => {
    const i = vertex * 3;
    return [
      mesh.positions[i] ?? 0,
      mesh.positions[i + 1] ?? 0,
      mesh.positions[i + 2] ?? 0,
    ] as const;
  };
  let total = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [ax, ay, az] = at(mesh.indices[i] ?? 0);
    const [bx, by, bz] = at(mesh.indices[i + 1] ?? 0);
    const [cx, cy, cz] = at(mesh.indices[i + 2] ?? 0);
    total += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return total;
}

it('moves the top face of a box up: the box grows and every face is remembered', async () => {
  const kernel = await createOcctKernel();
  const box = value(await kernel.extrude(rect(40, 20), 15));
  const top = await faceAt(kernel, box, { x: 20, y: 10, z: 15 });
  const before = value(await kernel.describeFaces(box)).map((f) => f.hash);
  const moved = value(await kernel.moveParts(box, [top], { by: { x: 0, y: 0, z: 5 } }));
  expect(value(await kernel.bounds(moved.shape)).max.z).toBeCloseTo(20);
  // Signed, so a solid that came out inside out would show; the box as made is the reference.
  const sign = Math.sign(await volume(kernel, box));
  expect((await volume(kernel, moved.shape)) * sign).toBeCloseTo(40 * 20 * 20);
  const known = new Set([
    ...moved.evolution.modified.map((m) => m.from),
    ...moved.evolution.unchanged,
    ...moved.evolution.deleted,
  ]);
  for (const hash of before) expect(known.has(hash)).toBe(true);
  expect(moved.evolution.deleted).toEqual([]);
});

it('moves an edge across the faces beside it and tilts the face between them', async () => {
  const kernel = await createOcctKernel();
  const box = value(await kernel.extrude(rect(40, 20), 15));
  const top = await faceAt(kernel, box, { x: 20, y: 10, z: 15 });
  const front = await faceAt(kernel, box, { x: 20, y: 0, z: 7.5 });
  const edge = value(await kernel.sharedEdge(top, front));
  if (edge === null) throw new Error('no shared edge');
  // Along the end faces' own plane (y and z), so every face stays flat.
  const moved = value(await kernel.moveParts(box, [edge], { by: { x: 0, y: 0, z: 6 } }));
  expect(value(await kernel.bounds(moved.shape)).max.z).toBeCloseTo(21);
  // The wedge added on top: half of 20 wide, 6 high, 40 long.
  const sign = Math.sign(await volume(kernel, box));
  expect((await volume(kernel, moved.shape)) * sign).toBeCloseTo(40 * 20 * 15 + 0.5 * 20 * 6 * 40);
  expect(value(await kernel.exportStep(moved.shape))).toContain('MANIFOLD_SOLID_BREP');
});

it('refuses a move along the edge itself, which changes nothing, and says so', async () => {
  const kernel = await createOcctKernel();
  const box = value(await kernel.extrude(rect(40, 20), 15));
  const top = await faceAt(kernel, box, { x: 20, y: 10, z: 15 });
  const front = await faceAt(kernel, box, { x: 20, y: 0, z: 7.5 });
  const edge = value(await kernel.sharedEdge(top, front));
  if (edge === null) throw new Error('no shared edge');
  const along = await kernel.moveParts(box, [edge], { by: { x: 6, y: 0, z: 0 } });
  expect(along.ok).toBe(false);
  if (!along.ok) expect(along.error.message).toMatch(/changes nothing/);
  // Across, whichever way it goes, the faces beside it tilt to meet it.
  expect((await kernel.moveParts(box, [edge], { by: { x: 0, y: 6, z: 3 } })).ok).toBe(true);
});

it('pulls the wall of a round boss outward and its top and the face under it follow', async () => {
  const kernel = await createOcctKernel();
  const plate = value(await kernel.extrude(rect(40, 20), 5));
  const disc = (radius: number) => ({
    loops: [[{ kind: 'circle' as const, center: { x: 20, y: 10 }, radius }]],
    origin: { x: 0, y: 0, z: 5 },
    normal: { x: 0, y: 0, z: 1 },
    xDirection: { x: 1, y: 0, z: 0 },
  });
  const withBoss = async (radius: number) =>
    value(await kernel.fuse(plate, value(await kernel.extrude(disc(radius), 6)))).shape;
  const part = await withBoss(4);
  const faces = value(await kernel.describeFaces(part));
  const wall = faces.find((f) => f.surfaceType === 'cylinder');
  if (wall === undefined) throw new Error('no wall');
  const sign = Math.sign(await volume(kernel, part));
  const wider = value(await kernel.offsetFaces(part, [wall.id], 1));
  // Against the same part made with the wider boss: a mesh's volume is short of the exact one by
  // as much for both.
  const made = await volume(kernel, await withBoss(5));
  expect((await volume(kernel, wider.shape)) * sign).toBeCloseTo(made * sign, 2);
  // The wall is the same face, moved: everything attached to it stays attached.
  expect(wider.evolution.modified.map((m) => m.from)).toContain(wall.hash);
});

it('turns the top of a box about its middle, which tilts it and keeps the volume', async () => {
  const kernel = await createOcctKernel();
  const box = value(await kernel.extrude(rect(40, 20), 15));
  const top = await faceAt(kernel, box, { x: 20, y: 10, z: 15 });
  const turn = { origin: { x: 20, y: 10, z: 15 }, axis: { x: 1, y: 0, z: 0 }, angle: 0.2 };
  const turned = value(await kernel.moveParts(box, [top], { by: { x: 0, y: 0, z: 0 }, turn }));
  expect(value(await kernel.bounds(turned.shape)).max.z).toBeCloseTo(15 + 10 * Math.tan(0.2));
  const sign = Math.sign(await volume(kernel, box));
  // A mesh's positions are 32-bit floats.
  expect((await volume(kernel, turned.shape)) * sign).toBeCloseTo(40 * 20 * 15, 2);
});

it('lifts one corner of a box, the top tilting about the far corner', async () => {
  const kernel = await createOcctKernel();
  const box = value(await kernel.extrude(rect(40, 20), 15));
  const corners = value(await kernel.subShapes(box, 'vertex'));
  const measured = await Promise.all(corners.map(async (c) => value(await kernel.bounds(c)).max));
  const at = measured.findIndex((p) => p.x > 39 && p.y > 19 && p.z > 14);
  const corner = corners[at];
  if (corner === undefined) throw new Error('no corner');
  const lifted = value(await kernel.moveParts(box, [corner], { by: { x: 0, y: 0, z: 4 } }));
  expect(value(await kernel.bounds(lifted.shape)).max.z).toBeCloseTo(19);
  expect(value(await kernel.bounds(lifted.shape)).min.z).toBeCloseTo(0);
});

it('pulls up the top of a box with rounded top edges, the roundings going with it', async () => {
  const kernel = await createOcctKernel();
  const box = value(await kernel.extrude(rect(40, 20), 15));
  const top = await faceAt(kernel, box, { x: 20, y: 10, z: 15 });
  const rim = value(await kernel.subShapes(box, 'edge'));
  const measured = await Promise.all(rim.map(async (e) => value(await kernel.bounds(e))));
  const upper = rim.filter((_, i) => (measured[i]?.min.z ?? 0) > 14.9);
  const rounded = value(await kernel.fillet(box, upper, 2));
  const pulled = await faceAt(kernel, rounded.shape, { x: 20, y: 10, z: 15 });
  expect(pulled).not.toBe(top);
  const sign = Math.sign(await volume(kernel, rounded.shape));
  const before = (await volume(kernel, rounded.shape)) * sign;
  const moved = value(
    await kernel.moveParts(rounded.shape, [pulled], { by: { x: 0, y: 0, z: 4 } }),
  );
  expect(value(await kernel.bounds(moved.shape)).max.z).toBeCloseTo(19);
  // The walls under the roundings grow by 4 all round: the footprint, unchanged, times 4.
  expect((await volume(kernel, moved.shape)) * sign).toBeCloseTo(before + 40 * 20 * 4, 1);
});

it('pushes the top of a box down past a chamfer, which then goes, as in a direct modeller', async () => {
  const kernel = await createOcctKernel();
  const box = value(await kernel.extrude(rect(40, 20), 15));
  const top = await faceAt(kernel, box, { x: 20, y: 10, z: 15 });
  const back = await faceAt(kernel, box, { x: 20, y: 20, z: 7.5 });
  const edge = value(await kernel.sharedEdge(top, back));
  if (edge === null) throw new Error('no shared edge');
  const chamfered = value(await kernel.chamfer(box, [edge], 2));
  const lowered = await faceAt(kernel, chamfered.shape, { x: 20, y: 9, z: 15 });
  const before = value(await kernel.describeFaces(chamfered.shape)).length;
  // Down 3: the 2 mm chamfer would have to shrink below nothing.
  const moved = value(
    await kernel.moveParts(chamfered.shape, [lowered], { by: { x: 0, y: 0, z: -3 } }),
  );
  expect(value(await kernel.bounds(moved.shape)).max.z).toBeCloseTo(12);
  expect(value(await kernel.describeFaces(moved.shape))).toHaveLength(before - 1);
  const sign = Math.sign(await volume(kernel, box));
  expect((await volume(kernel, moved.shape)) * sign).toBeCloseTo(40 * 20 * 12, 1);
  // Every face but the chamfer is still there under the name it had: the top was moved, not
  // made again, so what was attached to it stays attached.
  expect(moved.evolution.deleted).toHaveLength(1);
  expect(moved.evolution.generated).toEqual([]);
});

it('turns the top edge of a box about the vertical: the front twists, its bottom edge stays', async () => {
  // Turning the top edge must not take the front's bottom edge along.
  const kernel = await createOcctKernel();
  const box = value(await kernel.extrude(rect(40, 20), 15));
  const top = await faceAt(kernel, box, { x: 20, y: 10, z: 15 });
  const front = await faceAt(kernel, box, { x: 20, y: 0, z: 7.5 });
  const edge = value(await kernel.sharedEdge(top, front));
  if (edge === null) throw new Error('no shared edge');
  const angle = (15 * Math.PI) / 180;
  const turn = { origin: { x: 20, y: 0, z: 15 }, axis: { x: 0, y: 0, z: 1 }, angle };
  const turned = value(await kernel.moveParts(box, [edge], { by: { x: 0, y: 0, z: 0 }, turn }));
  const faces = value(await kernel.subShapes(turned.shape, 'face'));
  const measured = value(await kernel.measureFaces(faces));
  const bottom = measured.find((m) => Math.abs(m.centre.z) < 1e-6);
  // The bottom is untouched: same size, same place.
  expect(bottom?.area).toBeCloseTo(800, 3);
  expect(bottom?.centre.x).toBeCloseTo(20, 3);
  expect(bottom?.centre.y).toBeCloseTo(10, 3);
  // The top edge did turn: the top reaches out in front of the old front.
  expect(value(await kernel.bounds(turned.shape)).min.y).toBeLessThan(-1);
  const step = value(await kernel.exportStep(turned.shape));
  expect(step).toContain('MANIFOLD_SOLID_BREP');
  // The front is no longer flat.
  expect(step).toContain('B_SPLINE_SURFACE');
});

it('bevels an edge with two legs of different length (audit F-010)', async () => {
  const kernel = await createOcctKernel();
  const box = value(await kernel.extrude(rect(40, 20), 15));
  const top = await faceAt(kernel, box, { x: 20, y: 10, z: 15 });
  const front = await faceAt(kernel, box, { x: 20, y: 0, z: 7.5 });
  const edge = value(await kernel.sharedEdge(top, front));
  if (edge === null) throw new Error('no shared edge');
  const bevelled = value(await kernel.chamfer(box, [edge], 2, 4));
  const sign = Math.sign(await volume(kernel, box));
  // A triangle of legs 2 and 4 taken off along the 40 mm edge.
  expect((await volume(kernel, bevelled.shape)) * sign).toBeCloseTo(
    40 * 20 * 15 - 0.5 * 2 * 4 * 40,
    2,
  );
});

it('stretches a box along one axis and keeps a history for every face (audit F-014)', async () => {
  const kernel = await createOcctKernel();
  const box = value(await kernel.extrude(rect(40, 20), 15));
  const before = value(await kernel.describeFaces(box)).map((f) => f.hash);
  const stretched = value(await kernel.scale(box, { x: 20, y: 10, z: 7.5 }, { x: 2, y: 1, z: 1 }));
  const bounds = value(await kernel.bounds(stretched.shape));
  expect(bounds.max.x - bounds.min.x).toBeCloseTo(80);
  expect(bounds.max.y - bounds.min.y).toBeCloseTo(20);
  expect(stretched.evolution.modified.map((m) => m.from).sort()).toEqual([...before].sort());
});

it('rounds an edge with a radius larger than the faces beside it, taking them over (audit F-009)', async () => {
  const kernel = await createOcctKernel();
  const box = value(await kernel.extrude(rect(40, 20), 15));
  const top = await faceAt(kernel, box, { x: 20, y: 10, z: 15 });
  const front = await faceAt(kernel, box, { x: 20, y: 0, z: 7.5 });
  const edge = value(await kernel.sharedEdge(top, front));
  if (edge === null) throw new Error('no shared edge');
  const rounded = value(await kernel.fillet(box, [edge], 30));
  const sign = Math.sign(await volume(kernel, box));
  const left = (await volume(kernel, rounded.shape)) * sign;
  const kinds = value(await kernel.describeFaces(rounded.shape));
  // The box less the corner outside a 30 mm circle tangent to both planes: 5281 mm³, integrated
  // over the 20 × 15 section and run along 40 mm. Measured from the mesh, so not to the last digit.
  expect(Math.abs(left - 5281)).toBeLessThan(60);
  // Top and front taken over: the round, the back, the bottom and the two ends.
  expect(kinds).toHaveLength(5);
  expect(rounded.evolution.generated.length + rounded.evolution.modified.length).toBeGreaterThan(0);
  expect(value(await kernel.exportStep(rounded.shape))).toContain('CYLINDRICAL_SURFACE');
});
