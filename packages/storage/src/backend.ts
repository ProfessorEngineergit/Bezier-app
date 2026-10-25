/**
 * The storage interface: five operations over a key/value space, implemented by OPFS,
 * IndexedDB, desktop files (ADR 0006) and an in-memory map for tests.
 */

export interface StorageBackend {
  /**
   * Writes a key atomically (temporary file, then rename), so a crash leaves the previous
   * version (ADR 0009).
   */
  write(key: string, data: Uint8Array): Promise<void>;

  /** Appends to a key, creating it if absent. Used by the journal on every edit. */
  append(key: string, data: Uint8Array): Promise<void>;

  /** Returns the key's data, or null if it is missing. */
  read(key: string): Promise<Uint8Array | null>;

  /** Keys beginning with `prefix`. */
  list(prefix: string): Promise<readonly string[]>;

  remove(key: string): Promise<void>;
}

/** Storage keys for each piece of a document. */
export const layout = {
  /** The most recent snapshot. */
  snapshot: (id: string) => `docs/${id}/snapshot.json`,
  /** A rotated previous snapshot, kept as a fallback. */
  previousSnapshot: (id: string, index: number) => `docs/${id}/snapshot.${index}.json`,
  /** The append-only journal since the snapshot. One JSON object per line. */
  journal: (id: string) => `docs/${id}/journal.ndjson`,
  /** A journal entry too large to append, kept in a file of its own (journal-file.ts). */
  journalEntry: (id: string, seq: number) => `docs/${id}/entries/${seq}.json`,
  /** Prefix of those entry files. */
  journalEntries: (id: string) => `docs/${id}/entries/`,
  /** Everything belonging to one document. */
  documentPrefix: (id: string) => `docs/${id}/`,
  /** Start-page thumbnail; under the document prefix so it is deleted with the document. */
  thumbnail: (id: string) => `docs/${id}/thumbnail.png`,
  /** Undo/redo stacks, so undo survives reopening. */
  history: (id: string) => `docs/${id}/history.json`,
  /** Workspace state; copied and deleted with its document. */
  workspace: (id: string, workspace: string) => `docs/${id}/workspace-${workspace}.json`,
  /** The dashboard index. */
  index: () => 'index.json',
} as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encode(text: string): Uint8Array {
  return encoder.encode(text);
}

export function decode(data: Uint8Array): string {
  return decoder.decode(data);
}
