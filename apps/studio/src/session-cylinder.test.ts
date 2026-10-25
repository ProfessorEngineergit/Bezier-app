/** Radius edits retain a wall's saved reference through preview, commit, reopening and undo. */
import { formatRef, RebuildCache, type StableRef } from '@bezier/core';
import { createOcctKernel } from '@bezier/kernel/occt';
import { DocumentStore, MemoryBackend } from '@bezier/storage';
import { rectangleSketch } from '@bezier/ui';
import { expect, it } from 'vitest';
import { placeholderSolver } from './placeholder-solver.js';
import { Session } from './session.js';

it('resizes an existing hole without losing the selected wall or the neighbouring body', async () => {
  const kernel = await createOcctKernel();
  const store = new DocumentStore(new MemoryBackend());
  const deps = { kernel, solver: placeholderSolver(), store, cache: new RebuildCache() };
  const session = await Session.create('radius-doc', 'Hole editing', deps);
  let view = await session.apply([
    {
      op: 'addFeature',
      id: 'sketch',
      type: 'sketch',
      name: 'Sketch',
      index: 0,
      params: { plane: 'XY', sketch: rectangleSketch('r', { x: 0, y: 0, width: 40, height: 30 }) },
    },
    {
      op: 'addFeature',
      id: 'extrude',
      type: 'extrude',
      name: 'Extrude',
      index: 1,
      params: { sketch: 'sketch', distance: 10 },
    },
  ]);
  const top = (view.display?.faceRefs ?? [])
    .filter((ref): ref is StableRef => ref !== null)
    .find((ref, i) => {
      const mesh = view.display?.mesh;
      if (!mesh) return false;
      const triangle = mesh.triangleFaces.findIndex((f) => f === i);
      const vertex = mesh.indices[triangle * 3] ?? 0;
      return Math.abs((mesh.normals[vertex * 3 + 2] ?? 0) - 1) < 0.01 && ref.kind === 'face';
    });
  if (!top) throw new Error('No top face');
  view = await session.apply([
    {
      op: 'addFeature',
      id: 'other-sketch',
      type: 'sketch',
      name: 'Other sketch',
      index: 2,
      params: {
        plane: 'XY',
        sketch: rectangleSketch('other', { x: 100, y: 0, width: 20, height: 20 }),
      },
    },
    {
      op: 'addFeature',
      id: 'other-extrude',
      type: 'extrude',
      name: 'Other body',
      index: 3,
      params: { sketch: 'other-sketch', distance: 10 },
    },
  ]);
  const neighbour = view.bodies.find((body) => body.key === 'other-extrude');
  if (!neighbour) throw new Error('Missing neighbour');
  const neighbourFaces = neighbour.faces.map(formatRef);
  view = await session.apply({
    op: 'addFeature',
    id: 'hole',
    type: 'hole',
    name: 'Hole',
    index: 4,
    params: { faces: [formatRef(top)], x: 20, y: 15, diameter: 10, through: true },
  });
  let wall = null;
  for (const ref of view.display?.faceRefs ?? [])
    if (ref && (await session.cylinderOn(ref))?.inward) wall = ref;
  if (!wall) throw new Error('No hole wall');
  const named = formatRef(wall);
  expect((await session.cylinderOn(wall))?.radius).toBeCloseTo(5);
  const preview = await session.partPreview({ kind: 'radius', face: wall, radius: 7 });
  expect(preview?.mesh.indices.length).toBeGreaterThan(0);
  expect(session.document.features).toHaveLength(5);
  await session.endPartPreview();
  view = await session.apply({
    op: 'addFeature',
    id: 'resize',
    type: 'cylinder-radius',
    name: 'Hole radius',
    index: 5,
    params: { faces: [named], radius: 7 },
  });
  expect(view.statuses.get('resize')?.state, JSON.stringify(view.statuses.get('resize'))).toBe(
    'ok',
  );
  expect(view.bodies.find((body) => body.key === 'other-extrude')?.faces.map(formatRef)).toEqual(
    neighbourFaces,
  );
  expect((await session.cylinderOn(wall))?.radius).toBeCloseTo(7);
  view = await session.apply({
    op: 'updateParams',
    id: 'resize',
    params: { faces: [named], radius: 4 },
  });
  expect(view.statuses.get('resize')?.state, JSON.stringify(view.statuses.get('resize'))).toBe(
    'ok',
  );
  expect(view.bodies.find((body) => body.key === 'other-extrude')?.faces.map(formatRef)).toEqual(
    neighbourFaces,
  );
  expect((await session.cylinderOn(wall))?.radius).toBeCloseTo(4);
  const reopened = await Session.open('radius-doc', deps);
  if (!reopened) throw new Error('Project did not reopen');
  expect((await reopened.cylinderOn(wall))?.radius).toBeCloseTo(4);
  await session.undo();
  expect((await session.cylinderOn(wall))?.radius).toBeCloseTo(7);
  await session.undo();
  expect((await session.cylinderOn(wall))?.radius).toBeCloseTo(5);
  await session.redo();
  expect((await session.cylinderOn(wall))?.radius).toBeCloseTo(7);
}, 30_000);
