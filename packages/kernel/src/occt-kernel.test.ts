/**
 * Integration tests against the real OCCT WebAssembly module, covering the M0 slice: profile →
 * solid → rounded edge → STEP and STL (docs/roadmap.md).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { KernelResult, ShapeId } from './index.js';
import type { GeometryKernel, Profile } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';

const LOAD_TIMEOUT_MS = 120_000;

/** A 40 x 60 rectangle on the XY plane, the vertical slice's starting sketch. */
function rectangle(width = 40, height = 60): Profile {
  return {
    loops: [
      [
        { kind: 'line', start: { x: 0, y: 0 }, end: { x: width, y: 0 } },
        { kind: 'line', start: { x: width, y: 0 }, end: { x: width, y: height } },
        { kind: 'line', start: { x: width, y: height }, end: { x: 0, y: height } },
        { kind: 'line', start: { x: 0, y: height }, end: { x: 0, y: 0 } },
      ],
    ],
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    xDirection: { x: 1, y: 0, z: 0 },
  };
}

/** Unwrap a result, failing the test with the kernel's own message if it did not work. */
function expectOk<T>(result: KernelResult<T>): T {
  if (!result.ok) {
    throw new Error(`kernel refused: [${result.error.code}] ${result.error.message}`);
  }
  return result.value;
}

describe('OcctGeometryKernel', () => {
  let kernel: GeometryKernel;

  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, LOAD_TIMEOUT_MS);

  it('turns a sketch profile into a solid', async () => {
    const solid = expectOk(await kernel.extrude(rectangle(), 15));
    const mesh = expectOk(await kernel.tessellate(solid));

    expect(mesh.positions.length).toBeGreaterThan(0);
    // A box is six quads, so twelve triangles at the coarsest possible tessellation.
    expect(mesh.indices.length / 3).toBeGreaterThanOrEqual(12);
    await kernel.dispose(solid);
  });

  it('pulls every planar box face outward and inward without changing the other axes', async () => {
    const body = expectOk(await kernel.extrude(rectangle(), 15));
    const faces = expectOk(await kernel.describeFaces(body));
    const centres = expectOk(await kernel.measureFaces(faces.map((f) => f.id)));
    for (const [index, face] of faces.entries()) {
      const centre = centres[index]?.centre;
      if (!centre) throw new Error('Missing face centre');
      const axis = Math.abs(centre.x - 20) > 19 ? 'x' : Math.abs(centre.y - 30) > 29 ? 'y' : 'z';
      const upper = { x: 40, y: 60, z: 15 };
      const sign = centre[axis] > upper[axis] / 2 ? 1 : -1;
      for (const distance of [5, -3]) {
        const tool = expectOk(await kernel.extrudeFace(face.id, distance));
        const result = expectOk(
          distance > 0 ? await kernel.fuse(body, tool) : await kernel.cut(body, tool),
        );
        const bounds = expectOk(await kernel.bounds(result.shape));
        for (const coordinate of ['x', 'y', 'z'] as const) {
          expect(bounds.min[coordinate]).toBeCloseTo(
            coordinate === axis && sign < 0 ? -distance : 0,
            4,
          );
          expect(bounds.max[coordinate]).toBeCloseTo(
            upper[coordinate] + (coordinate === axis && sign > 0 ? distance : 0),
            4,
          );
        }
        await kernel.dispose(result.shape);
        await kernel.dispose(tool);
      }
      await kernel.dispose(face.id);
    }
    await kernel.dispose(body);
  });

  it('keeps a circle exact when it becomes a cylinder', async () => {
    const profile: Profile = {
      ...rectangle(),
      loops: [[{ kind: 'circle', center: { x: 0, y: 0 }, radius: 12 }]],
    };
    const solid = expectOk(await kernel.extrude(profile, 20));
    const faces = expectOk(await kernel.describeFaces(solid));

    expect(faces).toHaveLength(3);
    expect(faces.some((face) => face.surfaceType === 'cylinder')).toBe(true);
    await kernel.dispose(solid);
  });

  it('extrudes an exact arc mixed with lines', async () => {
    const profile: Profile = {
      ...rectangle(),
      loops: [
        [
          {
            kind: 'arc',
            start: { x: -10, y: 0 },
            mid: { x: 0, y: 10 },
            end: { x: 10, y: 0 },
          },
          { kind: 'line', start: { x: 10, y: 0 }, end: { x: 10, y: -10 } },
          { kind: 'line', start: { x: 10, y: -10 }, end: { x: -10, y: -10 } },
          { kind: 'line', start: { x: -10, y: -10 }, end: { x: -10, y: 0 } },
        ],
      ],
    };
    const solid = expectOk(await kernel.extrude(profile, 20));
    const faces = expectOk(await kernel.describeFaces(solid));

    expect(faces).toHaveLength(6);
    expect(faces.some((face) => face.surfaceType === 'cylinder')).toBe(true);
    await kernel.dispose(solid);
  });

  it('maps every triangle back to the face it came from', async () => {
    // Without this a click in the viewport can only resolve to a triangle index, which means
    // nothing once the model rebuilds.
    const solid = expectOk(await kernel.extrude(rectangle(), 15));
    const mesh = expectOk(await kernel.tessellate(solid));

    expect(mesh.triangleFaces.length).toBe(mesh.indices.length / 3);
    expect(new Set(mesh.triangleFaces).size).toBe(6);
    await kernel.dispose(solid);
  });

  it('indexes triangles into describeFaces, not into some other hash space', async () => {
    // Counting is not enough: `meshShape` hashes its face groups with a different upper bound than
    // the rest of the kernel, so raw hashes are distinct numbers that match no face.
    const solid = expectOk(await kernel.extrude(rectangle(), 15));
    const mesh = expectOk(await kernel.tessellate(solid));
    const faces = expectOk(await kernel.describeFaces(solid));

    for (const face of mesh.triangleFaces) {
      expect(face).toBeLessThan(faces.length);
    }
    // Every face of the box carries triangles, so the mapping is onto as well as in range.
    expect(new Set(mesh.triangleFaces)).toEqual(new Set(faces.map((_, i) => i)));

    await kernel.dispose(solid);
  });

  it('extracts edges as real curves for crisp display', async () => {
    const solid = expectOk(await kernel.extrude(rectangle(), 15));
    const edges = expectOk(await kernel.extractEdges(solid));

    expect(edges.positions.length).toBeGreaterThan(0);
    expect(edges.polylineStarts.length).toBe(12); // a box has twelve edges
    await kernel.dispose(solid);
  });

  it('rounds an edge and reports which faces changed', async () => {
    const solid = expectOk(await kernel.extrude(rectangle(), 15));
    const edges = expectOk(await kernel.subShapes(solid, 'edge'));
    const firstEdge = edges[0];
    expect(firstEdge).toBeDefined();

    const filleted = expectOk(await kernel.fillet(solid, [firstEdge as ShapeId], 3));

    // The evolution data is the reason this kernel is worth wrapping: a fillet generates a new
    // face and core threads that fact across rebuilds.
    const { modified, generated, unchanged } = filleted.evolution;

    // The four faces meeting the rounded edge are altered; two are untouched.
    expect(modified.length).toBe(4);
    for (const entry of modified) expect(entry.to.length).toBeGreaterThan(0);
    expect(unchanged.length).toBe(2);

    // The fillet surface itself. OCCT does not report it (it is generated from an edge and the
    // binding only takes faces as input), so the kernel recovers it by subtraction. One fillet
    // adds exactly one face to a box.
    expect(generated.length).toBe(1);

    await kernel.dispose(solid);
    await kernel.dispose(filleted.shape);
  });

  it('refuses a fillet that cannot fit, without throwing', async () => {
    // 500 mm of round on a 15 mm box. The kernel must decline: a failed fillet marks one
    // feature broken and does not take down the document.
    const solid = expectOk(await kernel.extrude(rectangle(), 15));
    const edges = expectOk(await kernel.subShapes(solid, 'edge'));

    const result = await kernel.fillet(solid, [edges[0] as ShapeId], 500);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('radius-too-large');
      // The message is written for the user, not for a log.
      expect(result.error.message).toMatch(/smaller radius/i);
    }
    await kernel.dispose(solid);
  });

  it('exports STEP that says it is STEP', async () => {
    const solid = expectOk(await kernel.extrude(rectangle(), 15));
    const step = expectOk(await kernel.exportStep(solid));

    expect(step).toMatch(/^ISO-10303-21/);
    expect(step).toContain('END-ISO-10303-21');
    await kernel.dispose(solid);
  });

  it('points every normal of a displayed solid out of it', async () => {
    // Whether OCCT gives a reversed face's normal pointing in or out has changed between
    // binding versions; the face-pull arrow, the shading and the outward bisector all follow
    // these normals.
    const solid = expectOk(await kernel.extrude(rectangle(), 15));
    const mesh = expectOk(await kernel.tessellate(solid));
    const box = expectOk(await kernel.bounds(solid));
    const centre = [
      (box.min.x + box.max.x) / 2,
      (box.min.y + box.max.y) / 2,
      (box.min.z + box.max.z) / 2,
    ];
    for (let t = 0; t < mesh.indices.length / 3; t++) {
      const corners = [0, 1, 2].map((k) => mesh.indices[t * 3 + k] ?? 0);
      const middle = [0, 1, 2].map(
        (axis) => corners.reduce((sum, v) => sum + (mesh.positions[v * 3 + axis] ?? 0), 0) / 3,
      );
      const vertex = corners[0] ?? 0;
      const outward = [0, 1, 2].reduce(
        (sum, axis) =>
          sum +
          (mesh.normals[vertex * 3 + axis] ?? 0) * ((middle[axis] ?? 0) - (centre[axis] ?? 0)),
        0,
      );
      expect(outward).toBeGreaterThan(0);
    }
    await kernel.dispose(solid);
  });

  it('exports STL that a slicer would accept', async () => {
    const solid = expectOk(await kernel.extrude(rectangle(), 15));
    const stl = expectOk(await kernel.exportStl(solid));

    expect(stl.byteLength).toBeGreaterThan(0);
    await kernel.dispose(solid);
  });

  it('round-trips through STEP', async () => {
    const solid = expectOk(await kernel.extrude(rectangle(), 15));
    const step = expectOk(await kernel.exportStep(solid));

    const reimported = expectOk(await kernel.importStep(step));
    const mesh = expectOk(await kernel.tessellate(reimported));
    expect(mesh.indices.length).toBeGreaterThan(0);

    await kernel.dispose(solid);
    await kernel.dispose(reimported);
  });

  it('cuts one solid out of another and reports the history', async () => {
    const base = expectOk(await kernel.extrude(rectangle(40, 60), 15));
    const tool = expectOk(await kernel.extrude(rectangle(10, 10), 30));

    const cut = expectOk(await kernel.cut(base, tool));
    expect(cut.evolution.generated.length).toBeGreaterThan(0);

    await kernel.dispose(base);
    await kernel.dispose(tool);
    await kernel.dispose(cut.shape);
  });

  it('accounts for every shape it hands out', async () => {
    // The kernel holds memory outside the JS heap, so the garbage collector cannot help.
    // Anything not disposed leaks until the tab closes.
    const before = await kernel.liveShapeCount();

    const solid = expectOk(await kernel.extrude(rectangle(), 15));
    expect(await kernel.liveShapeCount()).toBe(before + 1);

    await kernel.dispose(solid);
    expect(await kernel.liveShapeCount()).toBe(before);
  });

  it('rejects a profile that is not a closed loop', async () => {
    const twoPoints: Profile = {
      ...rectangle(),
      loops: [[{ kind: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }]],
    };

    const result = await kernel.extrude(twoPoints, 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('open-profile');
  });

  it('moves a body without changing its shape', async () => {
    const solid = expectOk(await kernel.extrude(rectangle(40, 60), 15));
    const before = expectOk(await kernel.bounds(solid));

    const moved = expectOk(await kernel.translate(solid, { x: 100, y: 0, z: 0 }));
    const after = expectOk(await kernel.bounds(moved.shape));

    expect(after.min.x).toBeCloseTo(before.min.x + 100, 6);
    expect(after.max.x).toBeCloseTo(before.max.x + 100, 6);
    // The other two axes, and so the size, are untouched: a rigid motion, not a transform that
    // could shear or scale the part.
    expect(after.min.y).toBeCloseTo(before.min.y, 6);
    expect(after.max.z).toBeCloseTo(before.max.z, 6);

    await kernel.dispose(solid);
    await kernel.dispose(moved.shape);
  });

  /**
   * A move goes through the kernel and not a renderer matrix because `@bezier/core` names faces by
   * provenance: every input face must come back modified or unchanged, none deleted, or the body
   * loses its fillets and selections.
   */
  it('accounts for every face when it moves one, so selections survive', async () => {
    const solid = expectOk(await kernel.extrude(rectangle(40, 60), 15));
    const faces = expectOk(await kernel.describeFaces(solid));
    const moved = expectOk(await kernel.translate(solid, { x: 5, y: -3, z: 2 }));

    expect(moved.evolution.deleted).toHaveLength(0);

    const accounted = new Set<number>([
      ...moved.evolution.modified.map((entry) => entry.from),
      ...moved.evolution.unchanged,
    ]);
    for (const face of faces) expect(accounted.has(face.hash)).toBe(true);

    // And the moved body still has the same six faces it started with.
    expect(expectOk(await kernel.describeFaces(moved.shape))).toHaveLength(faces.length);

    await kernel.dispose(solid);
    await kernel.dispose(moved.shape);
  });

  it('turns a body about an axis', async () => {
    const solid = expectOk(await kernel.extrude(rectangle(40, 60), 15));
    const before = expectOk(await kernel.bounds(solid));

    // A quarter turn about Z through the origin swaps how far the part reaches along X and Y.
    const turned = expectOk(
      await kernel.rotate(solid, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, Math.PI / 2),
    );
    const after = expectOk(await kernel.bounds(turned.shape));

    expect(after.max.x - after.min.x).toBeCloseTo(before.max.y - before.min.y, 6);
    expect(after.max.y - after.min.y).toBeCloseTo(before.max.x - before.min.x, 6);
    // Height is along the axis, so it is the one dimension a turn about Z leaves.
    expect(after.max.z - after.min.z).toBeCloseTo(before.max.z - before.min.z, 6);

    await kernel.dispose(solid);
    await kernel.dispose(turned.shape);
  });
});

describe('describing faces for the naming layer', () => {
  it(
    'returns a handle, a hash, and a geometric signature for every face',
    async () => {
      const kernel = await createOcctKernel();
      const solid = expectOk(await kernel.extrude(rectangle(), 15));

      const faces = expectOk(await kernel.describeFaces(solid));

      expect(faces).toHaveLength(6);
      for (const face of faces) expect(face.surfaceType.length).toBeGreaterThan(0);
      // Hashes tell faces apart within one pass, which is all they are good for.
      expect(new Set(faces.map((f) => f.hash)).size).toBe(6);

      // Area and centroid are a separate batched call, about 94% of the cost of a full face
      // description, needed only for faces about to be named.
      const measured = expectOk(await kernel.measureFaces(faces.map((f) => f.id)));
      expect(measured).toHaveLength(6);
      for (const m of measured) {
        expect(m.area).toBeGreaterThan(0);
        expect(Number.isFinite(m.centre.x)).toBe(true);
      }

      // Bounds: one call, and enough to locate the body deterministically.
      const box = expectOk(await kernel.bounds(solid));
      expect(box.max.x - box.min.x).toBeCloseTo(40, 5);
      expect(box.max.z - box.min.z).toBeCloseTo(15, 5);
    },
    LOAD_TIMEOUT_MS,
  );

  it(
    'finds the edge where two faces meet',
    async () => {
      // How an EdgeRef becomes something the kernel can act on: an edge is named by its two
      // adjacent faces, so resolving it means asking for the seam.
      const kernel = await createOcctKernel();
      const solid = expectOk(await kernel.extrude(rectangle(), 15));
      const faces = expectOk(await kernel.describeFaces(solid));

      let found = 0;
      for (let i = 0; i < faces.length; i++) {
        for (let j = i + 1; j < faces.length; j++) {
          const a = faces[i];
          const b = faces[j];
          if (a === undefined || b === undefined) continue;
          const edge = expectOk(await kernel.sharedEdge(a.id, b.id));
          if (edge !== null) found++;
        }
      }

      // A box has twelve edges, each shared by exactly one pair of faces. The three opposite
      // pairs share nothing.
      expect(found).toBe(12);
    },
    LOAD_TIMEOUT_MS,
  );
});
