/**
 * Multiple bodies in one document (ADR 0012): what the viewport receives, and how hiding and
 * removing a body behave, including after reopening. Uses the real kernel and store.
 */

import { formatRef, RebuildCache } from '@bezier/core';
import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { DocumentStore, MemoryBackend } from '@bezier/storage';
import { rectangleSketch } from '@bezier/ui';
import { beforeAll, describe, expect, it } from 'vitest';
import { placeholderSolver } from './placeholder-solver.js';
import { Session, type SessionDeps } from './session.js';

const LOAD_TIMEOUT_MS = 30_000;

let kernel: GeometryKernel;

beforeAll(async () => {
  kernel = await createOcctKernel();
}, LOAD_TIMEOUT_MS);

function deps(backend = new MemoryBackend()): SessionDeps {
  return {
    kernel,
    solver: placeholderSolver(),
    store: new DocumentStore(backend),
    cache: new RebuildCache(),
  };
}

/** Two boxes standing apart: extrude-1 at the origin, extrude-2 off to the side. */
async function twoBodies(d: SessionDeps) {
  const session = await Session.create('doc-1', 'Bodies', d);
  const box = async (n: number, x: number) => {
    await session.apply({
      op: 'addFeature',
      id: `sketch-${n}`,
      type: 'sketch',
      name: 'Sketch',
      index: session.document.features.length,
      params: { plane: 'XY', sketch: rectangleSketch('r', { x, y: 0, width: 20, height: 20 }) },
    });
    return session.apply({
      op: 'addFeature',
      id: `extrude-${n}`,
      type: 'extrude',
      name: 'Extrude',
      index: session.document.features.length,
      params: { sketch: `sketch-${n}`, distance: 10, direction: 'forward', operation: 'new' },
    });
  };
  await box(1, 0);
  const view = await box(2, 100);
  return { session, view };
}

const featuresShown = (faceRefs: readonly unknown[]) =>
  new Set(
    faceRefs.flatMap((ref) =>
      ref !== null && typeof ref === 'object' && 'feature' in ref ? [String(ref.feature)] : [],
    ),
  );

describe('a session with several bodies', () => {
  it('lists every body and shows them all', async () => {
    const { view } = await twoBodies(deps());
    expect(view.bodies.map((body) => [body.key, body.label, body.hidden])).toEqual([
      ['extrude-1', 'Body 1', false],
      ['extrude-2', 'Body 2', false],
    ]);
    expect(view.display?.faceRefs).toHaveLength(12);
    expect(view.display?.bodyRefs).toHaveLength(2);
  });

  it('hides a body from the viewport, and undo shows it again', async () => {
    const { session } = await twoBodies(deps());
    const hidden = await session.apply({ op: 'setBodyVisible', key: 'extrude-1', visible: false });
    expect(hidden.bodies.map((body) => body.hidden)).toEqual([true, false]);
    expect(hidden.document.meta.hiddenBodies).toEqual(['extrude-1']);
    expect(hidden.display?.faceRefs).toHaveLength(6);
    expect(featuresShown(hidden.display?.faceRefs ?? [])).toEqual(new Set(['extrude-2']));
    expect(hidden.display?.bodyRefs).toHaveLength(1);

    const shown = await session.undo();
    expect(shown?.display?.faceRefs).toHaveLength(12);
    // Showing it again gives back the document exactly as it was.
    expect('hiddenBodies' in (shown?.document.meta ?? {})).toBe(false);
  });

  it('shows nothing when every body is hidden, and still lists them', async () => {
    const { session } = await twoBodies(deps());
    await session.apply({ op: 'setBodyVisible', key: 'extrude-1', visible: false });
    const view = await session.apply({ op: 'setBodyVisible', key: 'extrude-2', visible: false });
    expect(view.display).toBeNull();
    expect(view.bodies).toHaveLength(2);
    expect(view.body).not.toBeNull();
  });

  it('keeps a body hidden when the document is opened again', async () => {
    const d = deps();
    const { session } = await twoBodies(d);
    await session.apply({ op: 'setBodyVisible', key: 'extrude-2', visible: false });
    const reopened = await Session.open(session.id, { ...d, cache: new RebuildCache() });
    const view = await reopened.rebuild();
    expect(view.bodies.map((body) => body.hidden)).toEqual([false, true]);
    expect(view.display?.faceRefs).toHaveLength(6);
  });

  it('opened again over the same cache, takes the drawing it made and meshes nothing (audit F-062)', async () => {
    const d = deps();
    const { session, view: first } = await twoBodies(d);
    let meshed = 0;
    const counting = new Proxy(kernel, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (key !== 'tessellate' || typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          meshed += 1;
          return value.apply(target, args);
        };
      },
    });
    const reopened = await Session.open(session.id, { ...d, kernel: counting });
    const view = await reopened.rebuild();
    expect(meshed).toBe(0);
    expect(view.display).toBe(first.display);
  });

  it('rolled back, builds only the steps above the marker and adds new ones there (audit F-052)', async () => {
    const { session } = await twoBodies(deps());
    const back = await session.rollBackTo(2);
    expect(back.rollback).toBe(2);
    expect(back.bodies).toHaveLength(1);
    // Nothing is written: the document still has all four steps.
    expect(session.document.features).toHaveLength(4);
    const added = await session.apply({
      op: 'addFeature',
      id: 'sketch-3',
      type: 'sketch',
      name: 'Sketch',
      index: session.document.features.length,
      params: { plane: 'XY', sketch: rectangleSketch('q', { x: 50, y: 0, width: 5, height: 5 }) },
    });
    expect(session.document.features.map((f) => f.id)).toEqual([
      'sketch-1',
      'extrude-1',
      'sketch-3',
      'sketch-2',
      'extrude-2',
    ]);
    expect(added.rollback).toBe(3);
    const forward = await session.rollBackTo(null);
    expect(forward.bodies).toHaveLength(2);
  });

  it('lists two equal boxes as one part with a quantity of two (audit F-054)', async () => {
    const { session } = await twoBodies(deps());
    const csv = await session.billOfMaterials();
    expect(csv?.split('\n')).toEqual([
      'Item,Name,Quantity,Volume (mm³),Surface (mm²),Bodies',
      '1,Body 1,2,4000.00,1600.00,Body 1; Body 2',
      '',
    ]);
  });

  it('removes one body as a step in the history', async () => {
    const { session, view } = await twoBodies(deps());
    const face = view.bodies[1]?.faces[0];
    if (face === undefined) throw new Error('the second body has no faces');
    const removed = await session.apply({
      op: 'addFeature',
      id: 'remove-1',
      type: 'remove-body',
      name: 'Remove Body 2',
      index: session.document.features.length,
      params: { faces: [formatRef(face)] },
    });
    expect(removed.statuses.get('remove-1')).toEqual({ state: 'ok' });
    expect(removed.bodies.map((body) => body.key)).toEqual(['extrude-1']);
    expect(removed.display?.faceRefs).toHaveLength(6);
  });

  it('holds no more kernel memory after the tenth rebuild than after the first', async () => {
    const { session } = await twoBodies(deps());
    await session.apply({ op: 'setBodyVisible', key: 'extrude-1', visible: false });
    await session.rebuild();
    const settled = await kernel.liveShapeCount();
    for (let i = 0; i < 9; i++) await session.rebuild();
    expect(await kernel.liveShapeCount()).toBe(settled);
  });
});
