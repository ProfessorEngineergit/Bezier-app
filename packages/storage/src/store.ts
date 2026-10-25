/**
 * The document store (ADR 0009). Edits are journalled before they are applied, snapshots keep
 * replay short, and a damaged journal or snapshot gives a partial load instead of an error.
 */

import type { CadDocument, JournalEntry, Operation, ReplayProblem } from '@bezier/core';
import { apply, createEmptyDocument, createEntry, replay } from '@bezier/core';
import { decode, encode, layout, type StorageBackend } from './backend.js';
import { appendEntry, readEntries, removeEntryFiles, summarize } from './journal-file.js';
import {
  addFolder,
  type DashboardIndex,
  type FolderInfo,
  forgetDocument,
  parseIndex,
  placeDocument,
  removeFolder,
  renameFolder,
  serializeIndex,
} from './organization.js';

/**
 * Journal entries before a snapshot. Longer journals open slower; shorter ones compact more
 * often, and compaction is the riskiest operation.
 */
const COMPACT_AFTER = 200;

/** Previous snapshots kept as a fallback for a bad current one. */
const SNAPSHOT_HISTORY = 3;

/**
 * A folder id unique even within one millisecond. `addFolder` treats a repeated id as a retry,
 * so a timestamp alone would drop the second of two quick creations.
 */
function randomFolderId(): string {
  return `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface DocumentInfo {
  id: string;
  name: string;
  modifiedAt: string;
}

export interface LoadResult {
  document: CadDocument;
  /** How many journal entries were replayed on top of the snapshot. */
  replayed: number;
  /**
   * Set when replay stopped early on a damaged journal. The document is valid up to the damage;
   * the caller must tell the user what was lost.
   */
  problem?: ReplayProblem;
  /** Set when the snapshot itself was unreadable and a previous one was used. */
  recoveredFrom?: string;
  /** The replayed journal entries, returned so a second read cannot disagree with the first. */
  entries: readonly JournalEntry[];
}

export class DocumentStore {
  readonly #backend: StorageBackend;
  readonly #compactAfter: number;
  /**
   * Journal length per document as last written or read, so appends need not re-read the journal
   * (an entry can be a whole imported file). Cleared on create, copy and delete.
   */
  readonly #journalLength = new Map<string, number>();

  /**
   * Serializes the dashboard index's read-modify-write cycle. Backend writes are atomic, but two
   * overlapping cycles could read the same index and lose the first write.
   */
  #indexQueue: Promise<unknown> = Promise.resolve();

  /**
   * Pending writes per document, so a delete can wait for them. Otherwise a late thumbnail write
   * could recreate the folder of a deleted project.
   */
  readonly #inFlight = new Map<string, Set<Promise<unknown>>>();

  /** Documents deleted by this store: nothing is written to them again. */
  readonly #deleted = new Set<string>();

  constructor(backend: StorageBackend, options: { compactAfter?: number } = {}) {
    this.#backend = backend;
    this.#compactAfter = options.compactAfter ?? COMPACT_AFTER;
  }

  // Writing.

  /**
   * Journals an edit, then applies it. A crash in between is recovered by replay on the next load.
   * Throws only if the journal write failed, in which case the edit did not happen.
   */
  async record(
    id: string,
    document: CadDocument,
    operation: Operation,
    now: () => Date = () => new Date(),
  ): Promise<{ document: CadDocument; entry: JournalEntry }> {
    const seq =
      (this.#journalLength.get(id) ?? (await readEntries(this.#backend, id, false)).length) + 1;
    const entry = createEntry(seq, operation, now().toISOString());

    if (this.#deleted.has(id)) throw new Error('This project was deleted.');

    // Durable first.
    await this.#writing(id, () => appendEntry(this.#backend, id, entry));
    this.#journalLength.set(id, seq);

    const applied = apply(document, operation);
    if (!applied.ok) {
      // A bug in the caller, not storage. The journalled entry is harmless: replay rejects it too.
      throw new Error(`operation could not be applied: ${applied.reason}`);
    }

    if (entry.seq >= this.#compactAfter) {
      await this.#compact(id, applied.document);
    }

    return { document: applied.document, entry };
  }

  // Reading.

  /**
   * Loads the snapshot plus the journal since. Falls back to previous snapshots if the current one
   * is unreadable, and returns a partial document if the journal is damaged.
   */
  async load(id: string): Promise<LoadResult> {
    const { document: base, recoveredFrom } = await this.#readSnapshot(id);
    const entries = await this.#readJournal(id);
    this.#journalLength.set(id, entries.length);
    const result = replay(base, entries);

    return {
      document: result.document,
      replayed: result.applied,
      // Only entries that applied, so the history matches the document.
      entries: entries.slice(0, result.applied),
      ...(result.problem === undefined ? {} : { problem: result.problem }),
      ...(recoveredFrom === undefined ? {} : { recoveredFrom }),
    };
  }

  async listDocuments(): Promise<readonly DocumentInfo[]> {
    const ids = await this.list();
    const infos = await Promise.all(
      ids.map(async (id): Promise<DocumentInfo> => {
        try {
          // Renames live in the journal until compaction, so the snapshot alone can be stale.
          // Summarizing the journal lines avoids a full replay per project.
          const { document: doc } = await this.#readSnapshot(id);
          const lines = await readEntries(this.#backend, id, false);
          return { id, ...summarize(lines, doc.meta) };
        } catch {
          return { id, name: id, modifiedAt: '' };
        }
      }),
    );
    return infos.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  /**
   * Deletes projects with no features and an empty journal. Unreadable projects are kept.
   * Returns how many were deleted.
   */
  async discardEmpty(): Promise<number> {
    let gone = 0;
    for (const id of await this.list()) {
      try {
        const { document } = await this.#readSnapshot(id);
        if (document.features.length > 0) continue;
        if ((await readEntries(this.#backend, id, false)).length > 0) continue;
        await this.deleteDocument(id);
        gone += 1;
      } catch {
        // Unreadable: kept.
      }
    }
    return gone;
  }

  async deleteDocument(id: string): Promise<void> {
    this.#journalLength.delete(id);
    // Mark first so new writes are refused, then wait for the ones already running.
    this.#deleted.add(id);
    await Promise.allSettled([...(this.#inFlight.get(id) ?? [])]);
    const keys = await this.#backend.list(layout.documentPrefix(id));
    await Promise.all(keys.map((key) => this.#backend.remove(key)));
    // Drop its folder placement too.
    await this.#mutateIndex((index) => forgetDocument(index, id));
  }

  /**
   * Stores the start-page thumbnail. Not journalled: replay must not depend on it, and it may be
   * missing.
   */
  async saveThumbnail(id: string, png: Uint8Array): Promise<void> {
    if (this.#deleted.has(id)) return;
    await this.#writing(id, () => this.#backend.write(layout.thumbnail(id), png));
  }

  async readThumbnail(id: string): Promise<Uint8Array | null> {
    return this.#backend.read(layout.thumbnail(id));
  }

  /** Stores the undo/redo stacks. Not journalled: losing them costs only undo. */
  async saveHistory(id: string, text: string): Promise<void> {
    if (this.#deleted.has(id)) return;
    await this.#writing(id, () => this.#backend.write(layout.history(id), encode(text)));
  }

  /** Stores presentation state beside the model. Not part of replay. */
  async saveWorkspace(id: string, workspace: string, text: string): Promise<void> {
    if (!/^[a-z][a-z0-9-]{0,32}$/.test(workspace)) throw new Error('Invalid workspace name.');
    if (this.#deleted.has(id)) return;
    await this.#writing(id, () =>
      this.#backend.write(layout.workspace(id, workspace), encode(text)),
    );
  }

  async readWorkspace(id: string, workspace: string): Promise<string | null> {
    if (!/^[a-z][a-z0-9-]{0,32}$/.test(workspace)) throw new Error('Invalid workspace name.');
    const raw = await this.#backend.read(layout.workspace(id, workspace));
    return raw === null ? null : decode(raw);
  }

  async readHistory(id: string): Promise<string | null> {
    const raw = await this.#backend.read(layout.history(id));
    return raw === null ? null : decode(raw);
  }

  /**
   * Renames through the journal (ADR 0009); rewriting only the snapshot would be undone by the
   * next replay. Costs a full load.
   */
  async rename(id: string, name: string, now: () => Date = () => new Date()): Promise<void> {
    const loaded = await this.load(id);
    await this.record(id, loaded.document, { op: 'renameDocument', name }, now);
    // Keep the snapshot's name in step so the library shows the rename at once. Replaying
    // `renameDocument` over it is a no-op. A race with compaction is possible but not locked.
    await this.#patchSnapshotName(id, name);
  }

  /** Updates the snapshot's display name, if a snapshot exists. */
  async #patchSnapshotName(id: string, name: string): Promise<void> {
    const snapshot = await this.#parseSnapshot(layout.snapshot(id));
    if (snapshot === null) return;
    await this.#backend.write(
      layout.snapshot(id),
      encode(JSON.stringify({ ...snapshot, meta: { ...snapshot.meta, name } }, null, 2)),
    );
  }

  /**
   * Copies a document to a new id as a single snapshot with no journal, so the copy's undo cannot
   * reach the original's edits.
   */
  async duplicate(
    id: string,
    newId: string,
    newName: string,
    now: () => Date = () => new Date(),
  ): Promise<void> {
    this.#journalLength.delete(newId);
    const loaded = await this.load(id);
    const timestamp = now().toISOString();
    const copy: CadDocument = {
      ...loaded.document,
      meta: { ...loaded.document.meta, name: newName, createdAt: timestamp, modifiedAt: timestamp },
    };
    await this.#backend.write(layout.snapshot(newId), encode(JSON.stringify(copy, null, 2)));
    const workspaceKeys = (await this.#backend.list(layout.documentPrefix(id))).filter((key) =>
      key.includes('/workspace-'),
    );
    for (const key of workspaceKeys) {
      const raw = await this.#backend.read(key);
      if (raw !== null)
        await this.#backend.write(
          key.replace(layout.documentPrefix(id), layout.documentPrefix(newId)),
          raw,
        );
    }
  }

  // Organisation.

  /** The dashboard's folders and placements. Empty when nothing has been filed. */
  async readIndex(): Promise<DashboardIndex> {
    const raw = await this.#backend.read(layout.index());
    return parseIndex(raw === null ? null : decode(raw));
  }

  async createFolder(name: string, id: string = randomFolderId()): Promise<FolderInfo> {
    await this.#mutateIndex((index) => addFolder(index, id, name));
    return { id, name };
  }

  async renameFolder(id: string, name: string): Promise<void> {
    await this.#mutateIndex((index) => renameFolder(index, id, name));
  }

  async deleteFolder(id: string): Promise<void> {
    await this.#mutateIndex((index) => removeFolder(index, id));
  }

  async moveToFolder(docId: string, folderId: string | null): Promise<void> {
    await this.#mutateIndex((index) => placeDocument(index, docId, folderId));
  }

  async #writeIndex(index: DashboardIndex): Promise<void> {
    await this.#backend.write(layout.index(), encode(serializeIndex(index)));
  }

  /** Read the index, transform it and write it back, queued behind any other in flight. */
  async #mutateIndex(transform: (index: DashboardIndex) => DashboardIndex): Promise<void> {
    const next = this.#indexQueue.then(async () => {
      await this.#writeIndex(transform(await this.readIndex()));
    });
    // The queue swallows rejections so one failure does not block later edits; `next` still
    // rejects for this caller.
    this.#indexQueue = next.catch(() => undefined);
    return next;
  }

  async list(): Promise<readonly string[]> {
    const keys = await this.#backend.list('docs/');
    const ids = new Set<string>();
    for (const key of keys) {
      const id = key.slice('docs/'.length).split('/')[0];
      if (id !== undefined && id !== '') ids.add(id);
    }
    return [...ids].sort();
  }

  /** Creates a document as a snapshot only. */
  async create(id: string, name: string, now: () => Date = () => new Date()): Promise<CadDocument> {
    this.#journalLength.delete(id);
    this.#deleted.delete(id);
    const document = createEmptyDocument(name, now);
    await this.#backend.write(layout.snapshot(id), encode(JSON.stringify(document, null, 2)));
    return document;
  }

  // Internals.

  /** Runs a write to a document's files, tracked in `#inFlight` until it settles. */
  #writing<T>(id: string, work: () => Promise<T>): Promise<T> {
    const running = work();
    let set = this.#inFlight.get(id);
    if (set === undefined) {
      set = new Set();
      this.#inFlight.set(id, set);
    }
    const writes = set;
    writes.add(running);
    const done = () => {
      writes.delete(running);
      if (writes.size === 0 && this.#inFlight.get(id) === writes) this.#inFlight.delete(id);
    };
    running.then(done, done);
    return running;
  }

  /** Imports a checkpoint as a new document; never replaces an existing project's journal. */
  async importProject(id: string, document: CadDocument): Promise<void> {
    this.#journalLength.delete(id);
    this.#deleted.delete(id);
    if (!/^[a-zA-Z0-9-]+$/.test(id) || (await this.list()).includes(id))
      throw new Error('Choose a new project identifier.');
    await this.#backend.write(layout.snapshot(id), encode(JSON.stringify(document)));
  }

  #readJournal(id: string): Promise<JournalEntry[]> {
    return readEntries(this.#backend, id, true);
  }

  async #readSnapshot(id: string): Promise<{ document: CadDocument; recoveredFrom?: string }> {
    const current = await this.#parseSnapshot(layout.snapshot(id));
    if (current !== null) return { document: current };

    // Current snapshot missing or unreadable: fall back to the rotated copies.
    for (let i = 0; i < SNAPSHOT_HISTORY; i++) {
      const key = layout.previousSnapshot(id, i);
      const older = await this.#parseSnapshot(key);
      if (older !== null) return { document: older, recoveredFrom: key };
    }

    // Nothing readable: start empty, the journal may still hold everything.
    return { document: createEmptyDocument(id, () => new Date(0)) };
  }

  async #parseSnapshot(key: string): Promise<CadDocument | null> {
    const raw = await this.#backend.read(key);
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(decode(raw)) as CadDocument;
      // A snapshot missing its shape is corruption, not an old format.
      return Array.isArray(parsed.features) && parsed.meta !== undefined ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * Folds the journal into a new snapshot. The only operation that removes durable data, so the
   * order is strict: rotate snapshots, write, verify read-back, then clear the journal. A crash at
   * any point leaves a recoverable state.
   */
  async #compact(id: string, document: CadDocument): Promise<void> {
    for (let i = SNAPSHOT_HISTORY - 1; i > 0; i--) {
      const older = await this.#backend.read(layout.previousSnapshot(id, i - 1));
      if (older !== null) await this.#backend.write(layout.previousSnapshot(id, i), older);
    }
    const current = await this.#backend.read(layout.snapshot(id));
    if (current !== null) await this.#backend.write(layout.previousSnapshot(id, 0), current);

    await this.#backend.write(layout.snapshot(id), encode(JSON.stringify(document, null, 2)));

    // Verify before deleting the journal.
    if ((await this.#parseSnapshot(layout.snapshot(id))) === null) return;

    await this.#backend.remove(layout.journal(id));
    // After the journal: an orphan entry file is debris, a line without its file is damage.
    await removeEntryFiles(this.#backend, id);
    this.#journalLength.set(id, 0);
  }
}
