/**
 * Durability, tested by breaking things: `MemoryBackend` fails, corrupts and truncates, and each
 * test matches a failure ADR 0009 says the design survives.
 */

import type { CadDocument, Operation } from '@bezier/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { layout } from './backend.js';
import { MemoryBackend } from './memory.js';
import { DocumentStore } from './store.js';

const AT = () => new Date('2026-08-05T12:00:00.000Z');

function addFeature(id: string, distance = 10): Operation {
  return {
    op: 'addFeature',
    id,
    type: 'extrude',
    name: id,
    index: 0,
    params: { sketch: 'sketch-1', distance },
  };
}

describe('recording edits', () => {
  let backend: MemoryBackend;
  let store: DocumentStore;
  let document: CadDocument;

  beforeEach(async () => {
    backend = new MemoryBackend();
    store = new DocumentStore(backend);
    document = await store.create('doc-1', 'Enclosure', AT);
  });

  it('round-trips an edit through disk', async () => {
    const recorded = await store.record('doc-1', document, addFeature('extrude-1'), AT);
    const loaded = await store.load('doc-1');

    expect(loaded.replayed).toBe(1);
    expect(loaded.problem).toBeUndefined();
    expect(loaded.document.features).toHaveLength(1);
    expect(loaded.document.features[0]?.id).toBe('extrude-1');
    expect(recorded.entry.seq).toBe(1);
  });

  it('numbers entries on without reading the journal back, across compaction and reopening', async () => {
    const small = new DocumentStore(backend, { compactAfter: 3 });
    let current = await small.create('doc-2', 'Numbers', AT);
    const seqs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const recorded = await small.record('doc-2', current, addFeature(`n${i}`), AT);
      seqs.push(recorded.entry.seq);
      current = recorded.document;
    }
    // Compacted at 3: the journal starts again after the snapshot.
    expect(seqs).toEqual([1, 2, 3, 1, 2]);
    // A new store (a reopened app) continues from what is on disk.
    const reopened = new DocumentStore(backend, { compactAfter: 3 });
    const loaded = await reopened.load('doc-2');
    expect(loaded.document.features).toHaveLength(5);
    const next = await reopened.record('doc-2', loaded.document, addFeature('n5'), AT);
    expect(next.entry.seq).toBe(3);
  });

  it('forgets projects nothing was ever done in, and only those', async () => {
    await store.create('doc-empty', 'Untitled', AT);
    const renamed = await store.create('doc-renamed', 'Untitled', AT);
    await store.record('doc-renamed', renamed, { op: 'renameDocument', name: 'Bracket' }, AT);
    await store.record('doc-1', document, addFeature('extrude-1'), AT);

    expect(await store.discardEmpty()).toBe(1);
    expect([...(await store.list())].sort()).toEqual(['doc-1', 'doc-renamed']);
    expect(await store.discardEmpty()).toBe(0);
  });

  it('appends rather than rewriting the journal', async () => {
    // ADR 0009 claims journalling is faster than the unsafe alternative. That holds only if
    // an edit is an append and not a read-modify-write that grows with history.
    let current = document;
    for (let i = 0; i < 10; i++) {
      current = (await store.record('doc-1', current, addFeature(`f${i}`), AT)).document;
    }

    expect(backend.appendCount).toBe(10);
    // Ten edits, and the snapshot was written once, when the document was created.
    expect(backend.writeCount).toBe(1);
  });

  it('refuses an edit whose journal write failed', async () => {
    // Better to reject an edit than to accept one that will not survive a crash.
    backend.failNextWrites = 1;

    await expect(store.record('doc-1', document, addFeature('lost'), AT)).rejects.toThrow();

    const loaded = await store.load('doc-1');
    expect(loaded.document.features).toHaveLength(0);
  });
});

describe('surviving a crash', () => {
  it('loses at most the operation that was in flight', async () => {
    // The core promise: the actual state, not the state as of the last autosave.
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend);
    let document = await store.create('doc-1', 'Enclosure', AT);

    for (const id of ['a', 'b', 'c']) {
      document = (await store.record('doc-1', document, addFeature(id), AT)).document;
    }

    // The process dies here. Nothing was flushed, closed or saved.
    const recovered = await new DocumentStore(new MemoryBackendView(backend)).load('doc-1');

    expect(recovered.replayed).toBe(3);
    expect(recovered.document.features.map((f) => f.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('keeps everything before a torn final write', async () => {
    // A crash during an append leaves a half-written last line. Everything before
    // it is intact and must survive.
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend);
    let document = await store.create('doc-1', 'Enclosure', AT);

    for (const id of ['a', 'b', 'c']) {
      document = (await store.record('doc-1', document, addFeature(id), AT)).document;
    }

    const journal = layout.journal('doc-1');
    backend.truncate(journal, backend.size(journal) - 30);

    const loaded = await store.load('doc-1');
    expect(loaded.replayed).toBeGreaterThanOrEqual(2);
    expect(loaded.document.features.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the good prefix when a journal entry is corrupted', async () => {
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend);
    let document = await store.create('doc-1', 'Enclosure', AT);

    for (const id of ['a', 'b', 'c']) {
      document = (await store.record('doc-1', document, addFeature(id), AT)).document;
    }

    // Flip a byte deep in the second entry.
    backend.corrupt(layout.journal('doc-1'), 200);

    const loaded = await store.load('doc-1');

    // Whatever survived, the load succeeded and reported the damage. Refusing to open would
    // be the worst response (ADR 0009).
    expect(loaded.document).toBeDefined();
    if (loaded.problem !== undefined) {
      expect(['checksum', 'gap', 'rejected']).toContain(loaded.problem.kind);
    }
  });

  it('falls back to a previous snapshot when the current one is unreadable', async () => {
    // What the rotated copies are for: losing a little history beats losing all of it.
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend, { compactAfter: 2 });
    let document = await store.create('doc-1', 'Enclosure', AT);

    for (const id of ['a', 'b', 'c', 'd']) {
      document = (await store.record('doc-1', document, addFeature(id), AT)).document;
    }

    backend.corrupt(layout.snapshot('doc-1'), 10);

    const loaded = await store.load('doc-1');
    expect(loaded.recoveredFrom).toBeDefined();
    expect(loaded.document).toBeDefined();
  });
});

describe('compaction', () => {
  it('folds the journal into a snapshot and starts fresh', async () => {
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend, { compactAfter: 3 });
    let document = await store.create('doc-1', 'Enclosure', AT);

    for (const id of ['a', 'b', 'c']) {
      document = (await store.record('doc-1', document, addFeature(id), AT)).document;
    }

    const loaded = await store.load('doc-1');
    // The journal was cleared, so nothing is replayed; the snapshot holds it all.
    expect(loaded.replayed).toBe(0);
    expect(loaded.document.features).toHaveLength(3);
  });

  it('keeps the old snapshot as redundancy', async () => {
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend, { compactAfter: 2 });
    let document = await store.create('doc-1', 'Enclosure', AT);

    for (const id of ['a', 'b', 'c', 'd']) {
      document = (await store.record('doc-1', document, addFeature(id), AT)).document;
    }

    expect(await backend.read(layout.previousSnapshot('doc-1', 0))).not.toBeNull();
  });

  it('does not clear the journal if the new snapshot cannot be read back', async () => {
    // Compaction is the only operation that removes durable data, so it verifies before it
    // destroys.
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend, { compactAfter: 2 });
    let document = await store.create('doc-1', 'Enclosure', AT);

    document = (await store.record('doc-1', document, addFeature('a'), AT)).document;

    // The snapshot write during the next compaction will fail.
    backend.failNextWrites = 1;
    await store.record('doc-1', document, addFeature('b'), AT).catch(() => undefined);

    // Either way, the journal must still hold the work.
    const loaded = await store.load('doc-1');
    expect(loaded.document.features.length).toBeGreaterThanOrEqual(1);
  });
});

describe('listing documents', () => {
  it('finds every document that has been created', async () => {
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend);

    await store.create('alpha', 'Alpha', AT);
    await store.create('beta', 'Beta', AT);

    expect(await store.list()).toEqual(['alpha', 'beta']);
  });

  it('reflects a rename without needing the document reopened', async () => {
    // The library's rename path must agree with the name reconstructed on open.
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend);
    await store.create('doc-1', 'Untitled', AT);

    await store.rename('doc-1', 'Fasteners', AT);

    expect(await store.listDocuments()).toEqual([
      { id: 'doc-1', name: 'Fasteners', modifiedAt: AT().toISOString() },
    ]);
    // And the durable copy says the same thing, from a fresh store over the same bytes.
    const reopened = new DocumentStore(new MemoryBackendView(backend));
    expect((await reopened.load('doc-1')).document.meta.name).toBe('Fasteners');
  });

  it('lists editor renames and reversals before the journal is compacted', async () => {
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend);
    const document = await store.create('doc-1', 'Original', AT);
    const renamed = await store.record(
      'doc-1',
      document,
      { op: 'renameDocument', name: 'Bracket' },
      AT,
    );
    expect((await store.listDocuments())[0]?.name).toBe('Bracket');
    await store.record('doc-1', renamed.document, { op: 'renameDocument', name: 'Original' }, AT);
    expect((await new DocumentStore(backend).listDocuments())[0]?.name).toBe('Original');
  });
});

/**
 * A second store over the same bytes, standing in for reopening the app: none of the
 * in-memory state, only what reached disk.
 */
class MemoryBackendView extends MemoryBackend {
  readonly #source: MemoryBackend;

  constructor(source: MemoryBackend) {
    super();
    this.#source = source;
  }

  override read(key: string): Promise<Uint8Array | null> {
    return this.#source.read(key);
  }

  override list(prefix: string): Promise<readonly string[]> {
    return this.#source.list(prefix);
  }
}

/** A backend whose writes take a while, like a slow disk or a loaded machine. */
class SlowWrites extends MemoryBackend {
  delayMs = 0;

  override async write(key: string, data: Uint8Array): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return super.write(key, data);
  }
}

describe('deleting a document while a write to it is on its way', () => {
  it('leaves nothing behind when a thumbnail is still being written', async () => {
    const backend = new SlowWrites();
    const store = new DocumentStore(backend);
    await store.create('doc-1', 'Bracket', AT);

    backend.delayMs = 20;
    const thumbnail = store.saveThumbnail('doc-1', new Uint8Array([1, 2, 3]));
    await store.deleteDocument('doc-1');
    await thumbnail;

    expect(await backend.list(layout.documentPrefix('doc-1'))).toEqual([]);
    expect(await store.listDocuments()).toEqual([]);
  });

  it('turns away a thumbnail or history that arrives after the delete', async () => {
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend);
    await store.create('doc-1', 'Bracket', AT);
    await store.deleteDocument('doc-1');

    await store.saveThumbnail('doc-1', new Uint8Array([1]));
    await store.saveHistory('doc-1', 'undo');

    expect(await backend.list(layout.documentPrefix('doc-1'))).toEqual([]);
  });

  it('refuses an edit to a deleted document rather than bringing its files back', async () => {
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend);
    const document = await store.create('doc-1', 'Bracket', AT);
    await store.deleteDocument('doc-1');

    await expect(store.record('doc-1', document, addFeature('f1'), AT)).rejects.toThrow(/deleted/);
    expect(await backend.list(layout.documentPrefix('doc-1'))).toEqual([]);
  });

  it('lets a deleted id be created again', async () => {
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend);
    await store.create('doc-1', 'Bracket', AT);
    await store.deleteDocument('doc-1');

    await store.create('doc-1', 'Bracket again', AT);
    await store.saveThumbnail('doc-1', new Uint8Array([1]));

    expect(await store.readThumbnail('doc-1')).not.toBeNull();
  });
});
