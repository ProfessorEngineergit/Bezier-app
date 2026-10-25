import { describe, expect, it } from 'vitest';
import { MemoryBackend } from './memory.js';
import { DocumentStore } from './store.js';

const at = () => new Date('2026-10-04T12:00:00Z');
describe('local workspace state', () => {
  it('survives reopening, copies with the project, and is deleted with it', async () => {
    const backend = new MemoryBackend();
    const store = new DocumentStore(backend);
    await store.create('original', 'Plate', at);
    await store.saveWorkspace('original', 'drawings', '{"active":"sheet-two"}');
    expect(await new DocumentStore(backend).readWorkspace('original', 'drawings')).toBe(
      '{"active":"sheet-two"}',
    );
    await store.duplicate('original', 'copy', 'Copy', at);
    expect(await store.readWorkspace('copy', 'drawings')).toBe('{"active":"sheet-two"}');
    await store.deleteDocument('original');
    expect(await store.readWorkspace('original', 'drawings')).toBeNull();
    expect(await store.readWorkspace('copy', 'drawings')).toBe('{"active":"sheet-two"}');
  });
  it('rejects workspace names that could escape the document directory', async () => {
    const store = new DocumentStore(new MemoryBackend());
    await expect(store.saveWorkspace('doc', '../drawings', '{}')).rejects.toThrow();
    await expect(store.readWorkspace('doc', 'drawings/../../other')).rejects.toThrow();
  });
});
