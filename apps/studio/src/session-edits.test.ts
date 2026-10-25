/**
 * Against the real kernel: body contacts after an edit (ADR 0012), found via `nearSolids` without
 * missing near or reporting far bodies; and `tryApply`, which must leave document, undo and redo as
 * if a failing edit had never been tried.
 */

import { faceRef, type Operation, RebuildCache } from '@bezier/core';
import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { DocumentStore, MemoryBackend } from '@bezier/storage';
import { rectangleSketch } from '@bezier/ui';
import { beforeAll, describe, expect, it } from 'vitest';
import { placeholderSolver } from './placeholder-solver.js';
import { Session } from './session.js';

let kernel: GeometryKernel;

beforeAll(async () => {
  kernel = await createOcctKernel();
}, 30_000);

/** A box of its own, `width` wide, standing at `x`. */
function box(n: number, x: number, width: number, height = 10): Operation[] {
  return [
    {
      op: 'addFeature',
      id: `sketch-${n}`,
      type: 'sketch',
      name: 'Sketch',
      index: (n - 1) * 2,
      params: { plane: 'XY', sketch: rectangleSketch(`r${n}`, { x, y: 0, width, height: 20 }) },
    },
    {
      op: 'addFeature',
      id: `extrude-${n}`,
      type: 'extrude',
      name: 'Extrude',
      index: (n - 1) * 2 + 1,
      params: { sketch: `sketch-${n}`, distance: height, direction: 'forward', operation: 'new' },
    },
  ];
}

describe('the bodies a body meets', () => {
  it('finds the one beside it and the one inside it, and not the one far off', async () => {
    const session = await Session.create('doc-1', 'Contacts', {
      kernel,
      solver: placeholderSolver(),
      store: new DocumentStore(new MemoryBackend()),
      cache: new RebuildCache(),
    });
    await session.apply([
      ...box(1, 0, 40),
      // Touching: its left side is box 1's right side.
      ...box(2, 40, 20),
      // Far off: nothing to ask about.
      ...box(3, 200, 20),
      // Overlapping: it stands half inside box 1.
      ...box(4, 30, 5, 30),
    ]);

    const contacts = await session.contactsOf(faceRef('extrude-1', 'end'));
    const byKey = new Map(contacts.map((contact) => [contact.body.key, contact.contact]));
    expect(byKey.get('extrude-2')).toBe('touching');
    expect(byKey.get('extrude-4')).toBe('overlapping');
    expect(byKey.has('extrude-3')).toBe(false);
    expect(contacts.every((contact) => contact.subject.key === 'extrude-1')).toBe(true);
  });
});

describe('a body dropped among many', () => {
  it('offers nothing when it meets more bodies than a question could sensibly name', async () => {
    const session = await Session.create('doc-1', 'Crowd', {
      kernel,
      solver: placeholderSolver(),
      store: new DocumentStore(new MemoryBackend()),
      cache: new RebuildCache(),
    });
    // Nine boxes in a row, each overlapping the long one laid across them.
    const crowd = Array.from({ length: 9 }, (_, i) => box(i + 2, i * 10, 8));
    await session.apply([...box(1, 0, 90), ...crowd.flat()]);
    expect(await session.contactsOf(faceRef('extrude-1', 'end'))).toEqual([]);
  });
});

describe('an edit tried by doing it', () => {
  const store = () => new DocumentStore(new MemoryBackend());
  const deps = () => ({
    kernel,
    solver: placeholderSolver(),
    store: store(),
    cache: new RebuildCache(),
  });

  it('keeps an edit that builds, as one step to undo', async () => {
    const session = await Session.create('doc-1', 'Tried', deps());
    await session.apply(box(1, 0, 40).slice(0, 1));
    const [, extrude] = box(1, 0, 40);
    const tried = await session.tryApply(extrude as Operation, 'extrude-1');
    expect(tried.refused).toBeNull();
    expect(tried.view.document.features.map((f) => f.id)).toEqual(['sketch-1', 'extrude-1']);
    const undone = await session.undo();
    expect(undone?.document.features.map((f) => f.id)).toEqual(['sketch-1']);
  });

  it('takes back an edit that does not build, and leaves undo and redo as they were', async () => {
    const session = await Session.create('doc-1', 'Tried', deps());
    await session.apply(box(1, 0, 40));
    await session.apply({ op: 'renameDocument', name: 'Renamed' });
    await session.undo();
    expect(session.canRedo).toBe(true);

    // An extrude of a sketch that is not there cannot build.
    const tried = await session.tryApply(
      {
        op: 'addFeature',
        id: 'extrude-9',
        type: 'extrude',
        name: 'Extrude',
        index: 2,
        params: { sketch: 'sketch-9', distance: 5, direction: 'forward', operation: 'new' },
      },
      'extrude-9',
    );
    expect(tried.refused).not.toBeNull();
    expect(tried.view.document.features.map((f) => f.id)).toEqual(['sketch-1', 'extrude-1']);
    expect(session.canRedo).toBe(true);
    const redone = await session.redo();
    expect(redone?.document.meta.name).toBe('Renamed');
    const undone = await session.undo();
    expect(undone?.document.meta.name).not.toBe('Renamed');
    expect((await session.undo())?.document.features).toHaveLength(0);
  });
});
