import type { CadDocument, Operation } from '@bezier/core';
import { describe, expect, it } from 'vitest';
import { decode, encode, layout } from './backend.js';
import { LARGE_ENTRY } from './journal-file.js';
import { MemoryBackend } from './memory.js';
import { DocumentStore } from './store.js';

const AT = () => new Date('2026-09-28T12:00:00.000Z');

/** An import large enough that copying it on every append would be slow (a STEP file's text). */
function largeImport(id: string): Operation {
  return {
    op: 'addFeature',
    id,
    type: 'import-step',
    name: id,
    index: 0,
    params: { file: 'x'.repeat(LARGE_ENTRY * 2), faceOrder: 'file' },
  };
}

function rename(name: string): Operation {
  return { op: 'renameDocument', name };
}

async function journalText(backend: MemoryBackend, id: string): Promise<string> {
  const raw = await backend.read(layout.journal(id));
  return raw === null ? '' : decode(raw);
}

describe('large journal entries', () => {
  it('keeps a large entry beside the journal, so the journal stays small', async () => {
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend);
    const document = await store.create('doc-1', 'Printer', AT);

    const imported = await store.record('doc-1', document, largeImport('import-1'), AT);
    await store.record('doc-1', imported.document, rename('Voron'), AT);

    expect((await journalText(backend, 'doc-1')).length).toBeLessThan(1000);
    expect(await backend.read(layout.journalEntry('doc-1', 1))).not.toBeNull();

    const loaded = await store.load('doc-1');
    expect(loaded.problem).toBeUndefined();
    expect(loaded.replayed).toBe(2);
    expect(loaded.document.features[0]?.params.file).toHaveLength(LARGE_ENTRY * 2);
    expect(loaded.document.meta.name).toBe('Voron');
  });

  it('numbers on correctly when the journal is counted rather than read', async () => {
    const backend = new MemoryBackend();
    const first = new DocumentStore(backend);
    const document = await first.create('doc-1', 'Printer', AT);
    const imported = await first.record('doc-1', document, largeImport('import-1'), AT);

    // A fresh store has to count the journal before its first append.
    const second = new DocumentStore(backend);
    const next = await second.record('doc-1', imported.document, rename('Voron'), AT);
    expect(next.entry.seq).toBe(2);
  });

  it('reports a lost entry file as damage instead of opening without it', async () => {
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend);
    const document = await store.create('doc-1', 'Printer', AT);
    const imported = await store.record('doc-1', document, largeImport('import-1'), AT);
    await store.record('doc-1', imported.document, rename('Voron'), AT);

    await backend.remove(layout.journalEntry('doc-1', 1));

    const loaded = await new DocumentStore(backend).load('doc-1');
    expect(loaded.problem).toBeDefined();
    expect(loaded.document.features).toHaveLength(0);
  });

  it('clears the entry files once compaction has folded them into the snapshot', async () => {
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend, { compactAfter: 2 });
    const document = await store.create('doc-1', 'Printer', AT);
    const imported = await store.record('doc-1', document, largeImport('import-1'), AT);
    await store.record('doc-1', imported.document, rename('Voron'), AT);

    expect(await backend.list(layout.journalEntries('doc-1'))).toEqual([]);
    const loaded = await store.load('doc-1');
    expect(loaded.document.features).toHaveLength(1);
  });

  it('lists a project by name and last edit without reading its large entries', async () => {
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend);
    const document: CadDocument = await store.create('doc-1', 'Printer', AT);
    const imported = await store.record('doc-1', document, largeImport('import-1'), AT);
    const later = () => new Date('2026-09-28T13:00:00.000Z');
    await store.record('doc-1', imported.document, rename('Voron'), later);

    await backend.remove(layout.journalEntry('doc-1', 1));

    expect(await store.listDocuments()).toEqual([
      { id: 'doc-1', name: 'Voron', modifiedAt: later().toISOString() },
    ]);
  });
});

describe('journals written before large entries were kept apart', () => {
  it('moves an inline import out of the journal the first time it is opened', async () => {
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend);
    const document = await store.create('doc-1', 'Printer', AT);
    const recorded = await store.record('doc-1', document, largeImport('import-1'), AT);
    // The older layout: the whole entry on one line.
    await backend.write(layout.journal('doc-1'), encode(`${JSON.stringify(recorded.entry)}\n`));
    await backend.remove(layout.journalEntry('doc-1', 1));

    const loaded = await new DocumentStore(backend).load('doc-1');
    expect(loaded.problem).toBeUndefined();
    expect(loaded.document.features).toHaveLength(1);
    expect((await journalText(backend, 'doc-1')).length).toBeLessThan(1000);

    const again = await new DocumentStore(backend).load('doc-1');
    expect(again.document.features[0]?.params.file).toHaveLength(LARGE_ENTRY * 2);
  });
});
