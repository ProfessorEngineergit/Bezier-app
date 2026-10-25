/**
 * End to end with only the constraint solver faked: real OCCT, journal and storage. Covers the
 * vertical-slice acceptance test at the API level, including step 9: changing an earlier dimension
 * keeps the fillet on the picked edge.
 */

import { edgeRef, faceRef, formatRef, RebuildCache } from '@bezier/core';
import type { GeometryKernel } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { DocumentStore, MemoryBackend } from '@bezier/storage';
import { rectangleSketch } from '@bezier/ui';
import { beforeAll, describe, expect, it } from 'vitest';
import { placeholderSolver } from './placeholder-solver.js';
import { Session, type SessionDeps, type SessionView } from './session.js';

const LOAD_TIMEOUT_MS = 30_000;

let kernel: GeometryKernel;

beforeAll(async () => {
  kernel = await createOcctKernel();
}, LOAD_TIMEOUT_MS);

function deps(backend = new MemoryBackend()): SessionDeps & { backend: MemoryBackend } {
  return {
    backend,
    kernel,
    solver: placeholderSolver(),
    store: new DocumentStore(backend),
    cache: new RebuildCache(),
  };
}

/**
 * Alters an entry's contents but keeps its checksum. A flipped random byte usually breaks the JSON,
 * which the store treats as a torn write; this reaches the checksum path instead.
 */
async function tamperWithSecondEntry(backend: MemoryBackend): Promise<void> {
  const key = 'docs/doc-1/journal.ndjson';
  const raw = await backend.read(key);
  const lines = new TextDecoder()
    .decode(raw ?? new Uint8Array())
    .trim()
    .split('\n');

  const entry = JSON.parse(lines[1] ?? '{}') as { op: { params: Record<string, unknown> } };
  entry.op.params = { ...entry.op.params, distance: 999 };
  lines[1] = JSON.stringify(entry);

  await backend.write(key, new TextEncoder().encode(`${lines.join('\n')}\n`));
}

/** A sketch, an extrusion, and nothing else. */
async function boxSession(d: SessionDeps, height = 15) {
  const session = await Session.create('doc-1', 'Test', d);

  await session.apply({
    op: 'addFeature',
    id: 'sketch-1',
    type: 'sketch',
    name: 'Sketch',
    index: 0,
    params: { plane: 'XY', sketch: rectangleSketch('r', { x: 0, y: 0, width: 40, height: 20 }) },
  });

  const view = await session.apply({
    op: 'addFeature',
    id: 'extrude-1',
    type: 'extrude',
    name: 'Extrude',
    index: 1,
    params: { sketch: 'sketch-1', distance: height, direction: 'forward', operation: 'new' },
  });

  return { session, view };
}

describe('Session', () => {
  it('keeps a lesson preview out of storage until the learner makes an edit', async () => {
    const d = deps();
    const { session } = await boxSession(d);
    const preview = Session.lessonPreview(JSON.stringify(session.document), d);
    const edits: string[] = [];
    preview.onEdit((edit) => edits.push(edit.description));
    expect(preview.isLessonPreview).toBe(true);
    expect((await preview.rebuild()).display).not.toBeNull();
    expect(await d.store.listDocuments()).toHaveLength(1);

    await preview.apply({
      op: 'updateParams',
      id: 'extrude-1',
      params: { sketch: 'sketch-1', distance: 25, direction: 'forward', operation: 'new' },
    });
    expect(preview.isLessonPreview).toBe(false);
    expect(await d.store.listDocuments()).toHaveLength(2);
    expect(edits).toHaveLength(1);
    const reopened = await Session.open(preview.id, d);
    expect(reopened.document.features).toEqual(preview.document.features);
  });

  it('refuses every edit of a read-only project, through undo too, and writes nothing', async () => {
    const d = deps();
    const { session } = await boxSession(d);
    const before = (await d.store.load('doc-1')).entries.length;
    session.readOnly = 'This project is shared with you to look at.';
    const change = {
      op: 'updateParams' as const,
      id: 'extrude-1',
      params: { sketch: 'sketch-1', distance: 30, direction: 'forward', operation: 'new' },
    };
    await expect(session.apply(change)).rejects.toThrow('shared with you to look at');
    await expect(session.undo()).rejects.toThrow('shared with you to look at');
    expect((await d.store.load('doc-1')).entries.length).toBe(before);
    session.readOnly = null;
    await session.apply(change);
    expect((await d.store.load('doc-1')).entries.length).toBe(before + 1);
  });

  it('builds a solid and names every face of it', async () => {
    const { view } = await boxSession(deps());

    expect(view.statuses.get('extrude-1')).toEqual({ state: 'ok' });
    expect(view.display).not.toBeNull();

    // Six faces, every one of them named: an unnamed face is one the user can click and get nothing
    // back from.
    const refs = view.display?.faceRefs ?? [];
    expect(refs).toHaveLength(6);
    expect(refs.every((ref) => ref !== null)).toBe(true);
  });

  it('lines the names up with the mesh, not merely alongside it', async () => {
    // The join that makes picking work: triangleFaces indexes into this list. If they were the same
    // length by luck and not by construction, every pick would return a plausible but wrong name.
    const { view } = await boxSession(deps());
    const display = view.display;
    if (display === null) throw new Error('expected geometry');

    for (const face of display.mesh.triangleFaces) {
      expect(face).toBeLessThan(display.faceRefs.length);
      expect(display.faceRefs[face]).not.toBeNull();
    }
  });

  it('keeps a fillet on the edge that was picked when an earlier feature changes', async () => {
    // Step 9 of the acceptance test.
    const d = deps();
    const { session } = await boxSession(d, 15);

    const top = faceRef('extrude-1', 'end');
    const side = faceRef('extrude-1', 'side-0');
    const picked = edgeRef(top, side);

    const filleted = await session.apply({
      op: 'addFeature',
      id: 'fillet-1',
      type: 'fillet',
      name: 'Fillet',
      index: 2,
      params: { edges: [formatRef(picked)], radius: 2 },
    });
    expect(filleted.statuses.get('fillet-1')).toEqual({ state: 'ok' });

    // Now change the extrusion the fillet sits on top of.
    const edited = await session.apply({
      op: 'updateParams',
      id: 'extrude-1',
      params: { sketch: 'sketch-1', distance: 25, direction: 'forward', operation: 'new' },
    });

    expect(edited.statuses.get('extrude-1')).toEqual({ state: 'ok' });
    expect(edited.statuses.get('fillet-1')).toEqual({ state: 'ok' });

    // And the rounded surface is still there, still named by the fillet.
    const names = (edited.display?.faceRefs ?? [])
      .filter((ref) => ref !== null)
      .map((ref) => formatRef(ref));
    expect(names.some((name) => name.startsWith('F:fillet-1:'))).toBe(true);
  });

  it('says which reference was lost rather than rounding something else', async () => {
    const d = deps();
    const { session } = await boxSession(d);

    const nonsense = edgeRef(faceRef('extrude-1', 'end'), faceRef('extrude-1', 'no-such-face'));
    const view = await session.apply({
      op: 'addFeature',
      id: 'fillet-1',
      type: 'fillet',
      name: 'Fillet',
      index: 2,
      params: { edges: [formatRef(nonsense)], radius: 2 },
    });

    const status = view.statuses.get('fillet-1');
    expect(status?.state).toBe('dangling');
    expect(status?.state === 'dangling' && status.lostRefs).toContain(formatRef(nonsense));
  });

  it('keeps the solid when a later feature fails', async () => {
    // One bad fillet must not cost the extrusion under it (ADR 0009).
    const d = deps();
    const { session } = await boxSession(d);

    const view = await session.apply({
      op: 'addFeature',
      id: 'fillet-1',
      type: 'fillet',
      name: 'Fillet',
      index: 2,
      // Far larger than the part. The kernel will refuse.
      params: {
        edges: [formatRef(edgeRef(faceRef('extrude-1', 'end'), faceRef('extrude-1', 'side-0')))],
        radius: 500,
      },
    });

    expect(view.statuses.get('extrude-1')).toEqual({ state: 'ok' });
    expect(view.statuses.get('fillet-1')?.state).not.toBe('ok');
    expect(view.display).not.toBeNull();
  });

  it('writes every edit to the journal before applying it', async () => {
    const d = deps();
    await boxSession(d);

    const journal = await d.backend.read('docs/doc-1/journal.ndjson');
    expect(journal).not.toBeNull();

    const lines = new TextDecoder()
      .decode(journal ?? new Uint8Array())
      .trim()
      .split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ seq: 1, op: { op: 'addFeature' } });
  });

  it('reopens a document and rebuilds the same solid', async () => {
    const backend = new MemoryBackend();
    const first = deps(backend);
    await boxSession(first);

    const reopened = await Session.open('doc-1', deps(backend));
    const view = await reopened.rebuild();

    expect(view.document.features.map((f) => f.id)).toEqual(['sketch-1', 'extrude-1']);
    expect(view.display?.faceRefs).toHaveLength(6);
  });

  it('opens a damaged document and says what was lost', async () => {
    const backend = new MemoryBackend();
    await boxSession(deps(backend));
    await tamperWithSecondEntry(backend);

    const session = await Session.open('doc-1', deps(backend));
    const view = await session.rebuild();

    // Refusing to open would be the worst response (ADR 0009): the user gets everything up to the
    // damage, plus a plain statement of what was lost.
    expect(view.recovery).toMatch(/Edit 2 was damaged/);
    expect(view.document.features.map((f) => f.id)).toEqual(['sketch-1']);
  });

  it('mentions the recovery once, not on every rebuild afterwards', async () => {
    const backend = new MemoryBackend();
    await boxSession(deps(backend));
    await tamperWithSecondEntry(backend);

    const session = await Session.open('doc-1', deps(backend));
    await session.rebuild();
    const second = await session.rebuild();

    // Repeating it every rebuild would turn a real warning into wallpaper.
    expect(second.recovery).toBeUndefined();
  });
});

describe('undo and redo', () => {
  it('offers nothing to undo on a document that has just been opened', async () => {
    const session = await Session.create('doc-1', 'Test', deps());
    expect(session.canUndo).toBe(false);
    expect(session.canRedo).toBe(false);
    expect(await session.undo()).toBeNull();
    expect(await session.redo()).toBeNull();
  });

  it('takes the last feature back off, and puts it back', async () => {
    const { session } = await boxSession(deps());

    const undone = await session.undo();
    expect(undone?.document.features.map((f) => f.id)).toEqual(['sketch-1']);
    expect(undone?.display).toBeNull();
    expect(undone?.canUndo).toBe(true);
    expect(undone?.canRedo).toBe(true);

    const redone = await session.redo();
    expect(redone?.document.features.map((f) => f.id)).toEqual(['sketch-1', 'extrude-1']);
    expect(redone?.display).not.toBeNull();
    expect(redone?.canRedo).toBe(false);
  });

  /**
   * `invert` reads the document's current parameters, so the inverse is taken before the write.
   * Taken after, undo would write 40 over 40 and change nothing.
   */
  it('restores the parameter value from before the edit, not the one after it', async () => {
    const d = deps();
    const { session } = await boxSession(d, 15);

    await session.apply({
      op: 'updateParams',
      id: 'extrude-1',
      params: { sketch: 'sketch-1', distance: 40, direction: 'forward', operation: 'new' },
    });

    const undone = await session.undo();
    const extrude = undone?.document.features.find((f) => f.id === 'extrude-1');
    expect(extrude?.params.distance).toBe(15);
  });

  it('restores a removed feature at the index it came from', async () => {
    const d = deps();
    const { session } = await boxSession(d);

    await session.apply({ op: 'removeFeature', id: 'sketch-1' });
    const undone = await session.undo();

    expect(undone?.document.features.map((f) => f.id)).toEqual(['sketch-1', 'extrude-1']);
  });

  it('survives being reopened, because the reversal is a journal entry of its own', async () => {
    const backend = new MemoryBackend();
    const { session } = await boxSession(deps(backend));
    await session.undo();

    // Undo stores the inverse, not a position: a position would be lost here and the undone feature
    // would come back.
    const reopened = await Session.open('doc-1', deps(backend));
    const view = await reopened.rebuild();
    expect(view.document.features.map((f) => f.id)).toEqual(['sketch-1']);
    // ...and the steps come back with it, saved beside the document (`session-history.ts`): the
    // sketch can still be undone, the extrude redone.
    expect(reopened.canUndo).toBe(true);
    expect(reopened.canRedo).toBe(true);
  });

  it('drops the redo trail once a fresh edit is made', async () => {
    const { session } = await boxSession(deps());

    await session.undo();
    expect(session.canRedo).toBe(true);

    const view = await session.apply({
      op: 'renameFeature',
      id: 'sketch-1',
      name: 'Something else',
    });

    // Redoing onto a diverged document would reapply an edit that no longer belongs to this
    // history.
    expect(view.canRedo).toBe(false);
    expect(await session.redo()).toBeNull();
  });

  it('steps back through several edits in order', async () => {
    const { session } = await boxSession(deps());

    await session.apply({ op: 'renameFeature', id: 'extrude-1', name: 'First' });
    await session.apply({ op: 'renameFeature', id: 'extrude-1', name: 'Second' });

    const nameAfter = async (view: SessionView | null) =>
      view?.document.features.find((f) => f.id === 'extrude-1')?.name;

    expect(await nameAfter(await session.undo())).toBe('First');
    expect(await nameAfter(await session.undo())).toBe('Extrude');
  });
});
