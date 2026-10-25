/**
 * Several bodies in one document, end to end through the rebuild against the real kernel
 * (ADR 0012). A change to one body must not rename, move or break another.
 */

import type { GeometryKernel, KernelResult, Vec3 } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import type { ConstraintSolver, Sketch, SketchId } from '@bezier/solver';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CadDocument, createEmptyDocument, type RebuildResult } from '../document.js';
import { listBodies } from '../rebuild/bodies.js';
import { rebuild } from '../rebuild/rebuild.js';
import { stubSolver, testSketch } from '../rebuild/testing.js';
import { parseRef } from '../stable-ref.js';
import { getFeature, readParams } from './registry.js';
import type { FeatureRecord } from './types.js';

const LOAD_TIMEOUT_MS = 120_000;

/** Solves nothing: every point is already where the sketch says it is. */
function placedSolver(): ConstraintSolver {
  return {
    solve: (sketch) => ({
      status: 'solved',
      positions: new Map(
        sketch.primitives.flatMap((p) =>
          p.kind === 'point' ? [[p.id, { x: p.x, y: p.y }] as const] : [],
        ),
      ),
      radii: new Map(),
      dof: 0,
      conflicting: [],
      redundant: [],
    }),
    dispose: () => {},
  };
}

function rectangle(x0: number, y0: number, x1: number, y1: number): Sketch {
  const corners: [SketchId, number, number][] = [
    ['p0', x0, y0],
    ['p1', x1, y0],
    ['p2', x1, y1],
    ['p3', x0, y1],
  ];
  return {
    primitives: [
      ...corners.map(([id, x, y]) => ({ kind: 'point' as const, id, x, y })),
      ...corners.map(([id], i) => ({
        kind: 'line' as const,
        id: `l${i}`,
        start: id,
        end: corners[(i + 1) % corners.length]?.[0] ?? 'p0',
      })),
    ],
    constraints: [],
  };
}

function sketch(id: string, x0: number, y0: number, x1: number, y1: number): FeatureRecord {
  return {
    id,
    type: 'sketch',
    name: id,
    params: { plane: 'XY', sketch: rectangle(x0, y0, x1, y1) },
  };
}

function extrude(
  id: string,
  sketchId: string,
  distance = 10,
  operation: 'new' | 'add' | 'cut' = 'new',
): FeatureRecord {
  return {
    id,
    type: 'extrude',
    name: id,
    params: { sketch: sketchId, distance, direction: 'forward', operation },
  };
}

function feature(id: string, type: string, params: Record<string, unknown>): FeatureRecord {
  return { id, type, name: id, params };
}

function documentOf(...features: FeatureRecord[]): CadDocument {
  return { ...createEmptyDocument('Bodies'), features };
}

function unwrap<T>(result: KernelResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

/** A box at x 0–10, and one standing apart at x 30–40. */
const twoBoxes = [
  sketch('sketch-1', 0, 0, 10, 10),
  extrude('extrude-1', 'sketch-1'),
  sketch('sketch-2', 30, 0, 40, 10),
  extrude('extrude-2', 'sketch-2'),
];

describe('a document with several bodies', () => {
  let kernel: GeometryKernel;
  const build = (...features: FeatureRecord[]) =>
    rebuild(documentOf(...features), { kernel, solver: placedSolver() });

  const bodies = async (result: RebuildResult) =>
    result.body === null ? 0 : unwrap(await kernel.solidFaceGroups(result.body)).length;

  const namesOf = (result: RebuildResult, feature: string) =>
    [...result.naming.knownNames()].filter((name) => name.startsWith(`F:${feature}:`)).sort();

  /** Where each named face of one feature sits, so a rename shows up as a move. */
  const centres = async (result: RebuildResult, feature: string) => {
    const found = new Map<string, Vec3>();
    for (const name of namesOf(result, feature)) {
      const face = await result.naming.resolve(kernel, parseRef(name));
      if (face === null) throw new Error(`${name} does not resolve`);
      const [measured] = unwrap(await kernel.measureFaces([face]));
      if (measured !== undefined) found.set(name, measured.centre);
    }
    return found;
  };

  const expectSameCentres = (a: Map<string, Vec3>, b: Map<string, Vec3>) => {
    expect([...b.keys()]).toEqual([...a.keys()]);
    for (const [name, centre] of a) {
      const other = b.get(name);
      expect(other?.x).toBeCloseTo(centre.x, 6);
      expect(other?.y).toBeCloseTo(centre.y, 6);
      expect(other?.z).toBeCloseTo(centre.z, 6);
    }
  };

  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, LOAD_TIMEOUT_MS);

  it('keeps the first body when a second one is made', async () => {
    const result = await build(...twoBoxes);
    expect(await bodies(result)).toBe(2);
    expect(namesOf(result, 'extrude-1')).toHaveLength(6);
    expect(namesOf(result, 'extrude-2')).toHaveLength(6);
  });

  it('names a second body exactly as it would be named alone', async () => {
    const together = await build(...twoBoxes);
    const alone = await build(sketch('sketch-2', 30, 0, 40, 10), extrude('extrude-2', 'sketch-2'));
    expectSameCentres(await centres(alone, 'extrude-2'), await centres(together, 'extrude-2'));
  });

  it('does not rename one body when another one changes', async () => {
    const before = await build(...twoBoxes);
    const wider = await build(sketch('sketch-1', -20, -5, 10, 25), ...twoBoxes.slice(1));
    expectSameCentres(await centres(before, 'extrude-2'), await centres(wider, 'extrude-2'));
  });

  it('keeps a fillet on one body when another body changes', async () => {
    const first = await build(...twoBoxes);
    const edges = [...(await first.naming.namedEdges(kernel)).keys()].filter((name) =>
      name.includes('extrude-2:end'),
    );
    const edge = edges[0];
    if (edge === undefined) throw new Error('the second box has no named top edge');
    const round = feature('fillet-1', 'fillet', { edges: [edge], radius: 2 });

    const result = await build(sketch('sketch-1', -20, -5, 10, 25), ...twoBoxes.slice(1), round);
    expect(result.statuses.get('fillet-1')).toEqual({ state: 'ok' });
    expect(await bodies(result)).toBe(2);
    expect(namesOf(result, 'fillet-1').length).toBeGreaterThan(0);
  });

  it('deletes a rounding face and the sharp edge comes back, on one body of two (audit F-068)', async () => {
    const first = await build(...twoBoxes);
    const edge = [...(await first.naming.namedEdges(kernel)).keys()].find((name) =>
      name.includes('extrude-2:end'),
    );
    if (edge === undefined) throw new Error('the second box has no named top edge');
    const round = feature('fillet-1', 'fillet', { edges: [edge], radius: 2 });
    const rounded = await build(...twoBoxes, round);
    const face = namesOf(rounded, 'fillet-1')[0];
    if (face === undefined) throw new Error('the round has no face');
    const removed = await build(
      ...twoBoxes,
      round,
      feature('remove-1', 'remove-faces', { faces: [face] }),
    );
    expect(removed.statuses.get('remove-1')).toEqual({ state: 'ok' });
    expect(await bodies(removed)).toBe(2);
    expect(namesOf(removed, 'fillet-1')).toHaveLength(0);
  });

  it('hollows one body of two and leaves the other alone', async () => {
    const before = await build(...twoBoxes);
    const result = await build(
      ...twoBoxes,
      feature('shell-1', 'shell', { faces: ['F:extrude-2:end'], thickness: 1 }),
    );
    expect(result.statuses.get('shell-1')).toEqual({ state: 'ok' });
    expect(await bodies(result)).toBe(2);
    expectSameCentres(await centres(before, 'extrude-1'), await centres(result, 'extrude-1'));
    expect(namesOf(result, 'shell-1').length).toBeGreaterThan(0);
  });

  it('cuts only the body the cut reaches', async () => {
    const before = await build(...twoBoxes);
    const result = await build(
      ...twoBoxes,
      sketch('sketch-3', 33, 3, 37, 7),
      extrude('pocket', 'sketch-3', 20, 'cut'),
    );
    expect(result.statuses.get('pocket')).toEqual({ state: 'ok' });
    expect(await bodies(result)).toBe(2);
    expectSameCentres(await centres(before, 'extrude-1'), await centres(result, 'extrude-1'));
  });

  it('removes one body and keeps the names on the other', async () => {
    const before = await build(...twoBoxes);
    const result = await build(
      ...twoBoxes,
      feature('remove-1', 'remove-body', { faces: ['F:extrude-1:start'] }),
    );
    expect(result.statuses.get('remove-1')).toEqual({ state: 'ok' });
    expect(await bodies(result)).toBe(1);
    expect(namesOf(result, 'extrude-1')).toEqual([]);
    expectSameCentres(await centres(before, 'extrude-2'), await centres(result, 'extrude-2'));
  });

  it('removes the last body, and a body made afterwards starts fresh', async () => {
    const emptied = await build(
      ...twoBoxes,
      feature('remove-1', 'remove-body', { faces: ['F:extrude-1:start', 'F:extrude-2:start'] }),
    );
    expect(emptied.statuses.get('remove-1')).toEqual({ state: 'ok' });
    expect(emptied.body).toBeNull();
    expect(emptied.mesh).toBeNull();
    expect(emptied.naming.knownNames().size).toBe(0);

    const again = await build(
      ...twoBoxes,
      feature('remove-1', 'remove-body', { faces: ['F:extrude-1:start', 'F:extrude-2:start'] }),
      sketch('sketch-3', 0, 0, 5, 5),
      extrude('extrude-3', 'sketch-3'),
    );
    expect(again.statuses.get('extrude-3')).toEqual({ state: 'ok' });
    expect(await bodies(again)).toBe(1);
    expect(namesOf(again, 'extrude-3')).toHaveLength(6);
  });

  it('lists a body a cut split in two as two bodies, keyed apart', async () => {
    const result = await build(
      sketch('sketch-1', 0, 0, 30, 10),
      extrude('extrude-1', 'sketch-1'),
      sketch('sketch-2', 10, -5, 20, 15),
      extrude('slot', 'sketch-2', 10, 'cut'),
      sketch('sketch-3', 50, 0, 60, 10),
      extrude('extrude-3', 'sketch-3'),
    );
    if (result.body === null) throw new Error('no body');
    const document = documentOf();
    const listed = await listBodies(kernel, result.body, result.naming, {
      ...document,
      features: [
        sketch('sketch-1', 0, 0, 30, 10),
        extrude('extrude-1', 'sketch-1'),
        sketch('sketch-2', 10, -5, 20, 15),
        extrude('slot', 'sketch-2', 10, 'cut'),
        sketch('sketch-3', 50, 0, 60, 10),
        extrude('extrude-3', 'sketch-3'),
      ],
      meta: { ...document.meta, hiddenBodies: ['extrude-1#2'] },
    });
    expect(listed.bodies.map((body) => [body.key, body.label, body.hidden])).toEqual([
      ['extrude-1', 'Body 1', false],
      ['extrude-1#2', 'Body 2', true],
      ['extrude-3', 'Body 3', false],
    ]);
    if (listed.visible === null || listed.visible === result.body) throw new Error('not split');
    expect(unwrap(await kernel.solidFaceGroups(listed.visible))).toHaveLength(2);
    await kernel.dispose(listed.visible);
  });

  it('splits one body in two and leaves the other alone', async () => {
    const before = await build(...twoBoxes);
    const result = await build(
      ...twoBoxes,
      feature('split-1', 'split-body', {
        faces: ['F:extrude-1:start'],
        plane: 'XY',
        offset: 4,
      }),
    );
    expect(result.statuses.get('split-1')).toEqual({ state: 'ok' });
    expect(await bodies(result)).toBe(3);
    expect(namesOf(result, 'split-1')).toHaveLength(2);
    expectSameCentres(await centres(before, 'extrude-2'), await centres(result, 'extrude-2'));
  });

  it('refuses a split plane that misses the body', async () => {
    const result = await build(
      ...twoBoxes,
      feature('split-1', 'split-body', { faces: ['F:extrude-1:start'], plane: 'XY', offset: 50 }),
    );
    expect(result.statuses.get('split-1')).toMatchObject({ state: 'failed' });
  });

  it('scales one body about its own middle', async () => {
    const result = await build(
      ...twoBoxes,
      feature('scale-1', 'scale', { faces: ['F:extrude-2:start'], factor: 2 }),
    );
    expect(result.statuses.get('scale-1')).toEqual({ state: 'ok' });
    if (result.body === null) throw new Error('no body');
    const bounds = unwrap(await kernel.bounds(result.body));
    // Body 2 ran 30..40 and 0..10; doubled about its middle it runs 25..45.
    expect(bounds.max.x).toBeCloseTo(45, 6);
    expect(bounds.min.x).toBeCloseTo(0, 6);
    expect(namesOf(result, 'extrude-2')).toHaveLength(6);
  });

  it('pulls a face into its own body only, never into a neighbour', async () => {
    const touching = [
      sketch('sketch-1', 0, 0, 10, 10),
      extrude('extrude-1', 'sketch-1'),
      sketch('sketch-2', 12, 0, 22, 10),
      extrude('extrude-2', 'sketch-2'),
    ];
    const first = await build(...touching);
    // The +X face of body 1, found by where it is.
    const faces = await centres(first, 'extrude-1');
    const side = [...faces].find(([, centre]) => Math.abs(centre.x - 10) < 1e-6)?.[0];
    if (side === undefined) throw new Error('no +X face');
    const result = await build(
      ...touching,
      feature('pull-1', 'face-extrude', { faces: [side], distance: 5 }),
    );
    expect(result.statuses.get('pull-1')).toEqual({ state: 'ok' });
    // Pulled 5 mm into the gap and past the neighbour: still two bodies.
    expect(await bodies(result)).toBe(2);
  });

  it('pulls a face out as one taller wall when asked to merge, and as a second wall when not', async () => {
    const box = [sketch('sketch-1', 0, 0, 10, 10), extrude('extrude-1', 'sketch-1')];
    const before = await build(...box);
    const faces = await centres(before, 'extrude-1');
    const top = [...faces].find(([, centre]) => Math.abs(centre.z - 10) < 1e-6)?.[0];
    if (top === undefined) throw new Error('no top face');
    const count = async (result: RebuildResult) =>
      result.body === null
        ? 0
        : (unwrap(await kernel.solidFaceGroups(result.body))[0]?.length ?? 0);

    // As older saved pulls build: four new walls and a cap, on top of the six.
    const seamed = await build(
      ...box,
      feature('pull-1', 'face-extrude', { faces: [top], distance: 5 }),
    );
    expect(seamed.statuses.get('pull-1')).toEqual({ state: 'ok' });
    expect(await count(seamed)).toBe(10);

    // Merged: a box again, six faces, 15 tall.
    const merged = await build(
      ...box,
      feature('pull-1', 'face-extrude', { faces: [top], distance: 5, merge: true }),
    );
    expect(merged.statuses.get('pull-1')).toEqual({ state: 'ok' });
    expect(await count(merged)).toBe(6);
    // The four walls keep the names they had and are the taller walls now: their middles rose.
    const after = await centres(merged, 'extrude-1');
    const walls = [...faces].filter(([, centre]) => Math.abs(centre.z - 5) < 1e-6);
    expect(walls).toHaveLength(4);
    for (const [name] of walls) expect(after.get(name)?.z).toBeCloseTo(7.5, 6);
    // And the bottom did not move.
    const bottom = [...faces].find(([, centre]) => Math.abs(centre.z) < 1e-6)?.[0] ?? '';
    expect(after.get(bottom)?.z).toBeCloseTo(0, 6);
    if (merged.body === null) throw new Error('no body');
    const box15 = unwrap(await kernel.bounds(merged.body));
    expect(box15.max.z).toBeCloseTo(15, 6);
  });

  it('pulls the end of a cylinder out as one taller cylinder', async () => {
    const round: FeatureRecord = {
      id: 'sketch-1',
      type: 'sketch',
      name: 'sketch-1',
      params: {
        plane: 'XY',
        sketch: {
          primitives: [
            { kind: 'point', id: 'c', x: 0, y: 0 },
            { kind: 'circle', id: 'k', center: 'c', radius: 5 },
          ],
          constraints: [],
        },
      },
    };
    const before = await build(round, extrude('extrude-1', 'sketch-1'));
    expect(before.statuses.get('extrude-1')).toEqual({ state: 'ok' });
    const faces = await centres(before, 'extrude-1');
    const top = [...faces].find(([, centre]) => Math.abs(centre.z - 10) < 1e-6)?.[0];
    if (top === undefined) throw new Error('no top face');
    const merged = await build(
      round,
      extrude('extrude-1', 'sketch-1'),
      feature('pull-1', 'face-extrude', { faces: [top], distance: 5, merge: true }),
    );
    expect(merged.statuses.get('pull-1')).toEqual({ state: 'ok' });
    if (merged.body === null) throw new Error('no body');
    // The wall, the bottom and the new top: no ring where the wall was 10 tall.
    expect(unwrap(await kernel.solidFaceGroups(merged.body))[0]?.length).toBe(3);
    expect(unwrap(await kernel.bounds(merged.body)).max.z).toBeCloseTo(15, 6);
  });

  it('imports a STEP file as a body of its own', async () => {
    const box = await build(sketch('sketch-1', 0, 0, 10, 10), extrude('extrude-1', 'sketch-1'));
    if (box.body === null) throw new Error('no body');
    const text = unwrap(await kernel.exportStep(box.body));
    const result = await build(...twoBoxes, feature('import-1', 'import-step', { file: text }));
    expect(result.statuses.get('import-1')).toEqual({ state: 'ok' });
    expect(await bodies(result)).toBe(3);
    expect(namesOf(result, 'import-1')).toHaveLength(6);
  });

  /** Two overlapping boxes, the second taller, and a third body nobody picks. */
  const overlapping = [
    sketch('sketch-1', 0, 0, 10, 10),
    extrude('extrude-1', 'sketch-1', 10),
    sketch('sketch-2', 5, 5, 15, 15),
    extrude('extrude-2', 'sketch-2', 20),
    sketch('sketch-3', 50, 0, 60, 10),
    extrude('extrude-3', 'sketch-3', 10),
  ];
  const combine = (operation: string, keepTools = false) =>
    feature('combine-1', 'combine', {
      target: ['F:extrude-1:start'],
      tools: ['F:extrude-2:start'],
      operation,
      keepTools,
    });

  it('joins two bodies into one and keeps the tool body’s names', async () => {
    const before = await build(...overlapping);
    const result = await build(...overlapping, combine('join'));
    expect(result.statuses.get('combine-1')).toEqual({ state: 'ok' });
    expect(await bodies(result)).toBe(2);
    // The tool's top face is untouched by the join, so it is still that face under the name it
    // had, and not a fresh one from the combine.
    const was = await centres(before, 'extrude-2');
    const top = [...was].find(([, centre]) => Math.abs(centre.z - 20) < 1e-6)?.[0];
    if (top === undefined) throw new Error('the tool body has no top face');
    const now = await centres(result, 'extrude-2');
    expect(now.get(top)).toEqual(was.get(top));
    expect(now.size).toBe(was.size);
    expectSameCentres(await centres(before, 'extrude-3'), await centres(result, 'extrude-3'));
  });

  it('cuts one body with another, and keeps the tool when asked', async () => {
    const cut = await build(...overlapping, combine('cut'));
    expect(cut.statuses.get('combine-1')).toEqual({ state: 'ok' });
    expect(await bodies(cut)).toBe(2);

    const kept = await build(...overlapping, combine('cut', true));
    expect(kept.statuses.get('combine-1')).toEqual({ state: 'ok' });
    expect(await bodies(kept)).toBe(3);
    const before = await build(...overlapping);
    expectSameCentres(await centres(before, 'extrude-2'), await centres(kept, 'extrude-2'));
  });

  it('intersects two bodies, and says so when they do not overlap', async () => {
    const common = await build(...overlapping, combine('intersect'));
    expect(common.statuses.get('combine-1')).toEqual({ state: 'ok' });
    if (common.body === null) throw new Error('no body');
    expect(await bodies(common)).toBe(2);

    const apart = await build(
      ...overlapping,
      feature('combine-1', 'combine', {
        target: ['F:extrude-1:start'],
        tools: ['F:extrude-3:start'],
        operation: 'intersect',
      }),
    );
    expect(apart.statuses.get('combine-1')).toMatchObject({ state: 'failed' });
  });

  it('refuses to combine a body with itself', async () => {
    const result = await build(
      ...overlapping,
      feature('combine-1', 'combine', {
        target: ['F:extrude-1:start'],
        tools: ['F:extrude-1:end'],
        operation: 'join',
      }),
    );
    expect(result.statuses.get('combine-1')).toMatchObject({ state: 'failed' });
  });

  it.each([
    ['combine, keeping tools', combine('cut', true)],
    ['combine', combine('join')],
    ['shell', feature('shell-1', 'shell', { faces: ['F:extrude-3:end'], thickness: 1 })],
    ['remove', feature('remove-1', 'remove-body', { faces: ['F:extrude-2:start'] })],
  ])('%s releases every intermediate it makes', async (_, record) => {
    const before = await build(...overlapping);
    const definition = getFeature(record.type);
    const params = readParams(record.type, record.params);
    if (definition === undefined || !params.ok) throw new Error(`cannot run ${record.type}`);
    const start = await kernel.liveShapeCount();
    const output = unwrap(
      await definition.rebuild(kernel, params.params as never, {
        body: before.body,
        resolve: (ref) => before.naming.resolve(kernel, ref),
        profiles: () => null,
      }),
    );
    // One new shape, the result. Everything made on the way there is gone.
    expect(await kernel.liveShapeCount()).toBe(start + 1);
    if (output.body !== null) await kernel.dispose(output.body);
  });
});

describe('a step that leaves the solid as it was', () => {
  it('keeps the names, so a body stays the one its first feature made (audit F-039)', async () => {
    const kernel = await createOcctKernel();
    const document = {
      ...createEmptyDocument('Picture after a box'),
      features: [
        testSketch,
        {
          id: 'extrude-1',
          type: 'extrude',
          name: 'Extrude',
          params: { sketch: 'sketch-1', distance: 5 },
        },
        {
          id: 'image-1',
          type: 'reference-image',
          name: 'Picture',
          params: { image: 'aGk=', mime: 'image/png' },
        },
      ],
    };
    const result = await rebuild(document, { kernel, solver: stubSolver() });
    if (result.body === null) throw new Error('no body');
    const listed = await listBodies(kernel, result.body, result.naming, document);
    expect(listed.bodies.map((b) => b.key)).toEqual(['extrude-1']);
  }, 120_000);
});
