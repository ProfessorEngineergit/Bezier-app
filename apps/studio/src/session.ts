/**
 * One open document: holds it, journals every edit, rebuilds and hands the result to the viewport
 * (`docs/architecture.md`).
 *
 * Record, then apply (ADR 0009): `DocumentStore.record` awaits the journal write before the
 * operation touches the in-memory document, so a crash loses at most the edit in flight.
 *
 * Not a React hook. All dependencies are injected so it is tested in Node.
 */

import type {
  BodySummary,
  CadDocument,
  FeatureId,
  FeatureStatus,
  JournalEntry,
  Operation,
  PlaneBasis,
  RebuildCache,
  RebuildDeps,
  RebuildResult,
  StableRef,
  TessellationChoice,
} from '@bezier/core';
import {
  apply,
  describeOperation,
  diffOperations,
  faceSketchBasis,
  formatRef,
  invert,
  parseProjectFile,
  rebuild,
} from '@bezier/core';
import type {
  CylindricalFace,
  GeometryKernel,
  MassProperties,
  ShapeId,
  TessellationOptions,
} from '@bezier/kernel';
import type { DisplayGeometry } from '@bezier/renderer';
import type { ConstraintSolver } from '@bezier/solver';
import type { DocumentStore } from '@bezier/storage';
import { billOfMaterials, bomCsv } from './bill-of-materials.js';
import { threeMf } from './formats/three-mf.js';
import { listBodiesNamed } from './import-part-names.js';
import { loadDocument } from './load-document.js';
import { joinStl, referenceTriangles, trianglesStl } from './mesh-stl.js';
import { Drawings, drawingsFor, drawsTheSame } from './session-drawn.js';
import {
  bodyMeshes,
  contactsIn,
  displayOf,
  faceOutlineIn,
  importColoursOf,
  sectionOutlineIn,
  solidOf,
} from './session-geometry.js';
import { describeProblem, readHistory, writeHistory } from './session-history.js';
import {
  editedRef,
  type PartEdit,
  PartEditPreview,
  type PartPreview,
} from './session-part-edit.js';
import { atMarker, rolledBack } from './session-rollback.js';
import { stepParts } from './session-step-parts.js';
import { traced } from './trace.js';

export interface SessionDeps {
  kernel: GeometryKernel;
  solver: ConstraintSolver;
  store: DocumentStore;
  cache?: RebuildCache;
  /**
   * Tessellation from the quality preference. Mutable and read at each rebuild, so changing the
   * setting affects the open document.
   */
  tessellation?: TessellationChoice;
  /** Receives an import's outline while it is being built. */
  onPreview?: RebuildDeps['onPreview'];
  /** Documents are in OPFS, so a worker can load them (`load-document.ts`). */
  loadOffThread?: boolean;
}

/** What the UI needs after a rebuild. */
export interface SessionView {
  document: CadDocument;
  statuses: ReadonlyMap<FeatureId, FeatureStatus>;
  /** Null when nothing built: an empty document, or a first feature that failed. */
  display: DisplayGeometry | null;
  /** The solid as it stands after this rebuild. Null when nothing built. */
  body: ShapeId | null;
  /**
   * Every body, hidden ones included, in creation order (ADR 0012). `display` shows only the
   * visible ones.
   */
  bodies: readonly BodySummary[];
  /** Every solved sketch: its plane (a face sketch's follows its face) and its closed regions. */
  sketches: RebuildResult['sketches'];
  durationMs: number;
  /** Set when the document was recovered rather than loaded cleanly. */
  recovery?: string;
  /**
   * The document's history, oldest first. Read from the journal rather than derived from the
   * feature list, so renames, reorders and deletions appear.
   */
  history: readonly { seq: number; at: string; description: string }[];
  /** Whether undo and redo are available. */
  canUndo: boolean;
  canRedo: boolean;
  /** Rollback marker (`session-rollback.ts`): steps from it on are suppressed. */
  rollback: number | null;
}

/** A durable document edit, suitable for a lesson's semantic timeline. */
export interface SessionEdit {
  operation: Operation;
  description: string;
  document: CadDocument;
  at: string;
}

/**
 * One reversible edit: the operation and its inverse. `invert` reads the document before the
 * operation (old parameters of an `updateParams`, the index of a removed feature), so the inverse
 * must be computed at the moment the edit is applied; afterwards it would be a no-op.
 */
type UndoStep = import('./session-history.js').UndoStep;

/** Another body that a body meets, and how. */
export interface BodyContact {
  body: BodySummary;
  /** The body that was asked about. */
  subject: BodySummary;
  contact: 'touching' | 'overlapping';
}

/** Why a feature did not build, for the user. */
function reasonOf(status: FeatureStatus | undefined): string {
  return status !== undefined && 'message' in status && status.message !== undefined
    ? status.message
    : 'This could not be built.';
}

/** Result of `tryApply`: the view to show, and why the edit was declined, if it was. */
export interface TriedEdit {
  view: SessionView;
  refused: string | null;
}

export class Session {
  readonly #deps: SessionDeps;
  readonly #id: string;
  #document: CadDocument;
  /** Public readers must not construct edits against an uncommitted preview. */
  #previewSource: CadDocument | null = null;
  #recovery: string | undefined;
  #journal: readonly JournalEntry[];
  #editListeners = new Set<(edit: SessionEdit) => void>();
  #lessonPreview = false;
  lessonProject: import('./lesson-project.js').LessonProject | null = null;
  /**
   * Why this project cannot be edited here (a shared project opened view-only), or null. Checked in
   * `#write`, the single durable write, so no edit path bypasses it.
   */
  readOnly: string | null = null;

  get isLessonPreview(): boolean {
    return this.#lessonPreview;
  }

  /** Operations written by the running action; passed to `onCommit` listeners when it ends. */
  #written: Operation[] | null = null;
  #commitListeners = new Set<(ops: readonly Operation[]) => void>();

  /**
   * Notifies after every action that changed the document (edit, undo, redo) with the operations it
   * wrote. One action is one shared-project change (`collab/live-project.ts`). Remote edits taken
   * in by `adopt` are not reported.
   */
  onCommit(listener: (ops: readonly Operation[]) => void): () => void {
    this.#commitListeners.add(listener);
    return () => this.#commitListeners.delete(listener);
  }

  onEdit(listener: (edit: SessionEdit) => void): () => void {
    this.#editListeners.add(listener);
    return () => this.#editListeners.delete(listener);
  }
  /**
   * Undoable edits, oldest first.
   *
   * Undo writes the inverse as a new journal entry rather than rewinding: the journal is
   * append-only (`DocumentStore` has `append`, no truncate), so a rewound entry would come back on
   * reopen. This keeps one durable path for every change, so an undo survives a crash like any edit
   * (ADR 0009). The journal grows on undo; the stacks live only as long as the session (see
   * `session-history.ts` for persistence).
   */
  #undoStack: readonly UndoStep[] = [];
  /** Undone edits to reapply, oldest first. Any new edit clears it. */
  #redoStack: readonly UndoStep[] = [];
  /**
   * Serialises every call that touches `#document`. `previewApply` swaps in a scratch document
   * across an async worker rebuild, and `apply` can arrive mid-drag; without the queue `apply`
   * could build on the scratch document or be overwritten when the preview restores. Required for
   * "record, then apply" (ADR 0009) to hold under overlapping calls.
   */
  #queue: Promise<unknown> = Promise.resolve();

  private constructor(
    id: string,
    document: CadDocument,
    deps: SessionDeps,
    journal: readonly JournalEntry[],
    recovery?: string,
  ) {
    this.#id = id;
    this.#document = document;
    this.#deps = deps;
    this.#journal = journal;
    this.#recovery = recovery;
  }

  /**
   * Opens a document, replaying whatever survived. A damaged journal yields a partial document and
   * an explanation that is shown in the UI, rather than a refusal to open.
   */
  static async open(id: string, deps: SessionDeps): Promise<Session> {
    const loaded = await traced('load', () =>
      loadDocument(deps.store, id, deps.loadOffThread === true),
    );

    const notes: string[] = [];
    if (loaded.problem !== undefined) {
      notes.push(describeProblem(loaded.problem));
    }
    if (loaded.recoveredFrom !== undefined) {
      notes.push('The last saved copy could not be read, so an earlier one was used.');
    }

    const session = new Session(
      id,
      loaded.document,
      deps,
      loaded.entries,
      notes.length > 0 ? notes.join(' ') : undefined,
    );
    if (id.startsWith('lesson-')) {
      const { readLessonProject } = await import('./lesson-project.js');
      try {
        session.lessonProject = readLessonProject(await deps.store.readWorkspace(id, 'lesson'));
      } catch {
        // A missing video association must not prevent the model from opening.
        session.lessonProject = null;
      }
    }
    // Restore undo across the reopen when the saved steps match this document. Missing or
    // unreadable history only means no undo.
    try {
      const saved = await deps.store.readHistory(id);
      const history = await traced('history-read', async () => readHistory(saved, loaded.document));
      session.#undoStack = history.undo;
      session.#redoStack = history.redo;
    } catch {
      // Unreadable history still opens the document.
    }
    return session;
  }

  /** Saves the undo and redo steps beside the document. Never fails an edit. */
  async #saveHistory(): Promise<void> {
    if (this.#lessonPreview) return;
    try {
      await this.#deps.store.saveHistory(
        this.#id,
        writeHistory(this.#document, this.#undoStack, this.#redoStack),
      );
    } catch {
      // Losing the history only costs undo after a reopen.
    }
  }

  /** Creates a new document. */
  static async create(id: string, name: string, deps: SessionDeps): Promise<Session> {
    const document = await deps.store.create(id, name);
    return new Session(id, document, deps, []);
  }

  /** Rebuilds a lesson state without creating a project until the learner edits it. */
  static lessonPreview(project: string, deps: SessionDeps, name?: string): Session {
    const parsed = parseProjectFile(project);
    // Recordings are usually made in "Untitled"; the learner's copy is named after the lesson so it
    // is distinguishable on the Learn page.
    const document =
      name === undefined || name.trim() === ''
        ? parsed
        : { ...parsed, meta: { ...parsed.meta, name: name.trim() } };
    const session = new Session(`lesson-${crypto.randomUUID()}`, document, deps, []);
    session.#lessonPreview = true;
    return session;
  }

  get document(): CadDocument {
    return this.#previewSource ?? this.#document;
  }

  /**
   * The storage id. Not on `CadDocument`, since it is the store's address for the document, not
   * journalled state an edit could change.
   */
  get id(): string {
    return this.#id;
  }

  /** Rollback marker, or null for the whole model (audit F-052). */
  #rollback: number | null = null;

  /** Rolls back to before step `at`, or forward again with null. Nothing is written. */
  rollBackTo(at: number | null): Promise<SessionView> {
    return this.#enqueue(() => {
      this.#rollback = at;
      return this.rebuild();
    });
  }

  /**
   * Records an edit, applies it and rebuilds. Throws only when the journal write failed, in which
   * case the edit did not happen.
   */
  async apply(operation: Operation | readonly Operation[]): Promise<SessionView> {
    return this.#enqueue(async () => {
      await this.#record(operation);
      return this.rebuild();
    });
  }

  /**
   * Records an edit that the next one completes, without rebuilding. Journalled and undoable like
   * `apply`; the next edit's rebuild shows both. Saves a rebuild of a second or more on large
   * assemblies.
   */
  async stage(operation: Operation | readonly Operation[]): Promise<void> {
    await this.#enqueue(() => this.#record(operation));
  }

  /** Writes an edit and its undo step. Not queued; every caller holds the queue. */
  async #record(operation: Operation | readonly Operation[]): Promise<void> {
    // While rolled back, an appended step goes in at the marker, which advances past it.
    const operations = (Array.isArray(operation) ? operation : [operation as Operation]).map(
      (next: Operation) => {
        const placed = atMarker(next, this.#rollback);
        this.#rollback = placed.at;
        return placed.operation;
      },
    );
    const inverse = await traced('write', () => this.#writeAll(operations));
    // A non-invertible operation is a wall: undoing past it would skip it, so everything before it
    // is dropped. This is why `invert` returns null instead of guessing.
    this.#undoStack =
      inverse === null ? [] : [...this.#undoStack, { forward: operations, inverse }];
    this.#redoStack = [];
    await traced('history', () => this.#saveHistory());
  }

  /**
   * Adds a feature only if it builds; otherwise the document is unchanged and the reason is
   * returned.
   *
   * Tried by doing it: the edit is written and built, and reverted (inverse written, undo step
   * dropped) if `check` failed. A separate trial built every edit twice (0.3 s per extrude beside
   * the Voron, WebKit). Edits that cannot be inverted are still trialled first.
   */
  async tryApply(
    operation: Operation | readonly Operation[],
    check: FeatureId,
  ): Promise<TriedEdit> {
    const operations = Array.isArray(operation) ? operation : [operation as Operation];
    if (operations.some((next) => invert(this.#document, next) === null)) {
      return this.#tryFirst(operations, check);
    }
    return this.#enqueue(async () => {
      // Saved so a declined edit does not clear the redo stack.
      const redo = this.#redoStack;
      const depth = this.#undoStack.length;
      await this.#record(operations);
      const view = await this.rebuild();
      const status = view.statuses.get(check);
      if (status?.state === 'ok') return { view, refused: null };
      const step = this.#undoStack[depth];
      if (step !== undefined) {
        for (const reverse of step.inverse) await this.#write(reverse);
        this.#undoStack = this.#undoStack.slice(0, depth);
      }
      this.#redoStack = redo;
      await traced('history', () => this.#saveHistory());
      return { view: await this.rebuild(), refused: reasonOf(status) };
    });
  }

  /** `tryApply` for a non-invertible edit: built first, written only if it succeeds. */
  async #tryFirst(operations: readonly Operation[], check: FeatureId): Promise<TriedEdit> {
    const trial = await traced('trial', () => this.#trial(operations));
    const status = trial?.get(check);
    if (trial === null || status === undefined || status.state !== 'ok') {
      return { view: await this.cancelPreview(), refused: reasonOf(status) };
    }
    return { view: await this.apply(operations), refused: null };
  }

  /**
   * Whether an edit would build, without writing or drawing it; only statuses are needed. The built
   * features stay in the rebuild cache, so the real rebuild that follows starts from them.
   */
  #trial(operation: Operation | readonly Operation[]): Promise<RebuildResult['statuses'] | null> {
    const operations = Array.isArray(operation) ? operation : [operation as Operation];
    return this.#enqueue(async () => {
      let scratch = this.#document;
      for (const next of operations) {
        const applied = apply(scratch, next);
        if (!applied.ok) return null;
        scratch = applied.document;
      }
      const deps = this.#deps;
      const result = await rebuild(scratch, {
        kernel: deps.kernel,
        solver: deps.solver,
        ...(deps.cache === undefined ? {} : { cache: deps.cache }),
        ...(deps.onPreview === undefined ? {} : { onPreview: deps.onPreview }),
        display: false,
      });
      return result.statuses;
    });
  }

  /**
   * Writes operations in order and returns their combined inverse, or null when one cannot be
   * inverted. Each inverse is computed just before its write (see `UndoStep`). Not queued; every
   * caller holds the queue.
   */
  async #writeAll(operations: readonly Operation[]): Promise<Operation[] | null> {
    const inverses: Operation[] = [];
    let invertible = true;
    for (const operation of operations) {
      // A redo after a collaborator's change may refer to something that is gone.
      if (!apply(this.#document, operation).ok) continue;
      const inverse = invert(this.#document, operation);
      await this.#write(operation);
      if (inverse === null) invertible = false;
      else inverses.unshift(inverse);
    }
    return invertible ? inverses : null;
  }

  /**
   * Brings the model to `target` as received from a collaborator (`collab/live-project.ts`).
   * Written as the difference (`diffOperations`) through the journal like any edit, but kept out of
   * undo and not reported to edit listeners, which would send it back.
   *
   * Allowed in read-only projects, so viewers follow changes. Returns null when nothing changed.
   */
  async adopt(target: CadDocument): Promise<SessionView | null> {
    return this.#enqueue(async () => {
      const ops = diffOperations(this.#document, target);
      if (ops.length === 0) return null;
      await traced('write', async () => {
        for (const operation of ops) {
          const recorded = await this.#deps.store.record(this.#id, this.#document, operation);
          this.#document = recorded.document;
          this.#journal = [...this.#journal, recorded.entry];
        }
      });
      await this.#saveHistory();
      return this.rebuild();
    });
  }

  /**
   * Opened as new and never changed, so it is not kept (`use-go-home.ts`). An empty journal alone
   * is not enough: a project made from a lesson checkpoint has a model and no journal yet.
   */
  get untouched(): boolean {
    return !this.expecting && this.#journal.length === 0 && this.#document.features.length === 0;
  }

  /** A model is being loaded in, so the project is not empty whatever the journal says. */
  expecting = false;

  get canUndo(): boolean {
    return this.#undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.#redoStack.length > 0;
  }

  /**
   * Undoes the last edit, writing the reversal to the journal. Returns null when there is nothing
   * to undo.
   */
  async undo(): Promise<SessionView | null> {
    return this.#enqueue(async () => {
      const step = this.#undoStack[this.#undoStack.length - 1];
      if (step === undefined) return null;
      await traced('write', async () => {
        // In a shared project part of this step may target something already removed; the rest
        // still applies.
        for (const operation of step.inverse) {
          if (apply(this.#document, operation).ok) await this.#write(operation);
        }
      });
      this.#undoStack = this.#undoStack.slice(0, -1);
      this.#redoStack = [...this.#redoStack, step];
      await traced('history', () => this.#saveHistory());
      return this.rebuild();
    });
  }

  /** Reapplies the most recently undone edit. */
  async redo(): Promise<SessionView | null> {
    return this.#enqueue(async () => {
      const step = this.#redoStack[this.#redoStack.length - 1];
      if (step === undefined) return null;
      // Re-inverted against the current state; the original inverse described a different document.
      const inverse = await this.#writeAll(step.forward);
      this.#redoStack = this.#redoStack.slice(0, -1);
      this.#undoStack =
        inverse === null ? [] : [...this.#undoStack, { forward: step.forward, inverse }];
      await this.#saveHistory();
      return this.rebuild();
    });
  }

  /**
   * The single durable write: journal first, then the in-memory document. Undo and redo use it too,
   * since a reversal that skipped the journal could disagree with what was saved (ADR 0009). Not
   * queued; every caller holds the queue.
   */
  async #write(operation: Operation): Promise<void> {
    if (this.readOnly !== null) throw new Error(this.readOnly);
    // Validated before journalling: an entry that does not apply stops every later replay at that
    // point (ADR 0009).
    const check = apply(this.#document, operation);
    if (!check.ok) throw new Error('This changed meanwhile. Try again.', { cause: check.reason });
    if (this.#lessonPreview) {
      await this.#deps.store.importProject(this.#id, this.#document);
      if (this.lessonProject !== null)
        await this.#deps.store.saveWorkspace(
          this.#id,
          'lesson',
          JSON.stringify(this.lessonProject),
        );
      this.#lessonPreview = false;
    }
    const recorded = await this.#deps.store.record(this.#id, this.#document, operation);
    this.#document = recorded.document;
    this.#journal = [...this.#journal, recorded.entry];
    this.#written?.push(operation);
    const edit: SessionEdit = {
      operation,
      description: describeOperation(operation),
      document: recorded.document,
      at: recorded.entry.at,
    };
    for (const listener of this.#editListeners) listener(edit);
  }

  /**
   * Rebuilds with a temporary change without journalling, for live drag previews. The session's
   * document is unchanged, so a later `apply` writes exactly one entry. Returns null when the
   * operation is structurally invalid (not a kernel error).
   */
  async previewApply(operation: Operation | readonly Operation[]): Promise<SessionView | null> {
    const operations = Array.isArray(operation) ? operation : [operation as Operation];
    return this.#enqueue(async () => {
      let scratch = this.#document;
      for (const next of operations) {
        const applied = apply(scratch, next);
        if (!applied.ok) return null;
        scratch = applied.document;
      }
      const saved = this.#document;
      this.#previewSource = saved;
      this.#document = scratch;
      try {
        return await this.rebuild();
      } finally {
        this.#document = saved;
        this.#previewSource = null;
      }
    });
  }

  /**
   * Preview of a face pull, round or bevel being dragged, built from its solid alone
   * (`session-part-edit.ts`). Only for an edit at the end of the document; callers use
   * `previewApply` otherwise. `replacing` is that edit when it is already in the document; the
   * solid is then taken from the document before it.
   */
  partPreview(edit: PartEdit, replacing?: FeatureId): Promise<PartPreview | null> {
    return this.#enqueue(async () => {
      const on = editedRef(edit);
      const key = `${formatRef(on)}|${replacing ?? ''}`;
      let part = this.#part;
      if (part === null || part.document !== this.#document || part.target !== key) {
        await part?.end();
        this.#part = null;
        let base = this.#document;
        if (replacing !== undefined) {
          const without = apply(base, { op: 'removeFeature', id: replacing });
          if (!without.ok) return null;
          base = without.document;
        }
        const { kernel, tessellation } = this.#deps;
        const shown = this.#shown;
        part = await traced('part-start', async () =>
          PartEditPreview.start(kernel, await this.#build(base), on, key, tessellation, {
            document: this.#document,
            shown,
          }),
        );
        this.#part = part;
      }
      const editing = part;
      return editing === null ? null : traced('part', () => editing.at(edit));
    });
  }

  /** Releases what `partPreview` held for the drag. */
  endPartPreview(): Promise<void> {
    return this.#enqueue(async () => {
      await this.#part?.end();
      this.#part = null;
    });
  }

  /**
   * The geometry engine restarted and every shape it held is gone, so cached drawings and previews
   * must not be reused; the next rebuild recreates them.
   */
  engineReplaced(): void {
    this.#drawn.clear();
    this.#part = null;
    this.#shown = [];
  }

  #part: PartEditPreview | null = null;
  /** The drawing's faces per solid, as last drawn; what a part preview replaces. */
  #shown: readonly (readonly StableRef[])[] = [];

  /** The cylinder this face lies on, or null when it is not cylindrical or no longer exists. */
  cylinderOn(face: StableRef): Promise<CylindricalFace | null> {
    return this.#enqueue(async () => {
      const result = await this.#build();
      const handle = await result.naming.resolve(this.#deps.kernel, face);
      if (handle === null) return null;
      const cylinder = await this.#deps.kernel.faceCylinder(handle);
      return cylinder.ok ? cylinder.value : null;
    });
  }

  /**
   * The plane a sketch on this face would use, or null when the face is not flat or no longer
   * exists. Asked of the kernel, not the mesh: a finely tessellated cylinder can look flat in
   * triangles.
   */
  sketchBasisOn(face: StableRef): Promise<PlaneBasis | null> {
    return this.#enqueue(async () => {
      const deps = this.#deps;
      const result = await this.#build();
      const handle = await result.naming.resolve(deps.kernel, face);
      if (handle === null) return null;
      const plane = await deps.kernel.facePlane(handle);
      return plane.ok ? faceSketchBasis(plane.value.origin, plane.value.normal) : null;
    });
  }

  /** The edges of a flat face, in its sketch coordinates, for Project. */
  faceOutline(face: StableRef): Promise<readonly (readonly { x: number; y: number }[])[] | null> {
    return this.#enqueue(async () => {
      const deps = this.#deps;
      const result = await this.#build();
      return faceOutlineIn(deps.kernel, result, face);
    });
  }

  /** Where the parts meet a sketch's plane, in its coordinates, for Intersection. */
  sectionOutline(
    basis: PlaneBasis,
  ): Promise<readonly (readonly { x: number; y: number }[])[] | null> {
    return this.#enqueue(async () =>
      sectionOutlineIn(this.#deps.kernel, await this.#build(), basis),
    );
  }

  /**
   * The other bodies the body owning `face` touches or overlaps. Asked after a part is made or
   * moved against another, to decide whether to offer join, cut or neither (ADR 0012).
   */
  contactsOf(face: StableRef): Promise<readonly BodyContact[]> {
    return this.#enqueue(async () => {
      const { kernel } = this.#deps;
      const result = await this.#build();
      return contactsIn(kernel, result, this.#document, face);
    });
  }

  /**
   * Builds the document's body without drawing it, for queries that need shape and names but no
   * triangles. Building with display meshed every solid of a lightweight-drawn assembly again at
   * full detail. Not queued; every caller holds the queue.
   */
  #build(document = this.#document): Promise<RebuildResult> {
    const deps = this.#deps;
    return rebuild(document, {
      kernel: deps.kernel,
      solver: deps.solver,
      ...(deps.cache === undefined ? {} : { cache: deps.cache }),
      display: false,
    });
  }

  /** Face colours per imported file, by file key. */
  readonly #importColours = new Map<string, Uint32Array | null>();

  /** Cached drawings (`session-drawn.ts`), shared with later sessions over the same cache. */
  readonly #ownDrawn = new Drawings();
  get #drawn(): Drawings {
    return drawingsFor(this.#deps.cache, this.#ownDrawn);
  }

  /** Restores committed geometry once all in-flight preview work has finished. */
  cancelPreview(): Promise<SessionView> {
    return this.#enqueue(() => this.rebuild());
  }

  /**
   * Runs `task` after every queued call has settled. A prior failure is caught only so the next
   * task can start; its caller still receives it. Otherwise one rejected `apply` would leave
   * `#queue` rejected and block every later edit.
   */
  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = async () => {
      this.#written = [];
      try {
        return await task();
      } finally {
        const ops = this.#written;
        this.#written = null;
        if (ops.length > 0) for (const listener of this.#commitListeners) listener(ops);
      }
    };
    const result = this.#queue.then(run, run);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async rebuild(): Promise<SessionView> {
    const deps = this.#deps;
    if (this.#rollback !== null && this.#rollback >= this.#document.features.length)
      this.#rollback = null;
    const built = rolledBack(this.#document, this.#rollback);
    // Without display: drawn below, unless this body's recent drawing can be reused.
    const result = await traced('rebuild', () =>
      rebuild(built, {
        kernel: deps.kernel,
        solver: deps.solver,
        ...(deps.cache === undefined ? {} : { cache: deps.cache }),
        ...(deps.tessellation === undefined ? {} : { tessellation: deps.tessellation }),
        ...(deps.onPreview === undefined ? {} : { onPreview: deps.onPreview }),
        display: false,
      }),
    );

    const body = result.body;
    const key = body === null ? null : Drawings.keyOf(body, built);
    const drawn = key === null ? undefined : this.#drawn.get(key);
    let bodies: readonly BodySummary[] = [];
    let display: DisplayGeometry | null = null;
    if (drawn !== undefined && drawsTheSame(drawn, deps.tessellation)) {
      bodies = drawn.bodies;
      display = drawn.display;
    } else if (body !== null) {
      const listed = await traced('bodies', async () =>
        listBodiesNamed(deps.kernel, body, result.naming, this.#document),
      );
      display = await traced('display', () =>
        displayOf(deps.kernel, result, listed.visible, deps.tessellation),
      );
      if (display !== null) {
        const faceColours = await importColoursOf(
          deps.kernel,
          this.#document,
          display,
          this.#importColours,
        );
        if (faceColours !== undefined) display = { ...display, faceColours };
      }
      bodies = listed.bodies;
      if (key !== null)
        this.#drawn.remember(key, { tessellation: deps.tessellation, bodies, display });
    }

    this.#shown = display?.bodyRefs ?? [];
    const view: SessionView = {
      document: this.#document,
      statuses: result.statuses,
      display,
      body: result.body,
      bodies,
      sketches: result.sketches,
      durationMs: result.durationMs,
      history: this.#journal.map((entry) => ({
        seq: entry.seq,
        at: entry.at,
        description: describeOperation(entry.op),
      })),
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      rollback: this.#rollback,
      ...(this.#recovery === undefined ? {} : { recovery: this.#recovery }),
    };

    // Reported once, not on every later rebuild.
    this.#recovery = undefined;
    return view;
  }

  /**
   * STL bytes for the current body, or null when there is nothing to export. The ShapeId stays in
   * this class: it is a live kernel handle, and the UI should not hold handles (`@bezier/core`
   * ownership rules).
   */
  async exportStl(
    faces: readonly StableRef[] | null = null,
    tolerance?: TessellationOptions,
  ): Promise<Uint8Array | null> {
    const solid = await this.#exportSolid(faces, async (shape) => {
      const result = await this.#deps.kernel.exportStl(shape, tolerance);
      // Report the actual reason rather than "no solid yet".
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    });
    // The whole model includes imported meshes.
    const meshes = faces === null ? referenceTriangles(this.#document) : [];
    if (meshes.length === 0) return solid;
    const loose = trianglesStl(meshes);
    return solid === null ? loose : joinStl([solid, loose]);
  }

  /** Volume, surface and centre of the picked bodies together (audit F-001). */
  /** The bill of materials of the visible bodies, as CSV (`bill-of-materials.ts`, F-054). */
  async billOfMaterials(): Promise<string | null> {
    const bodies = (await this.rebuild()).bodies;
    const lines = await billOfMaterials(bodies, (faces) => this.massOf(faces));
    return lines.length === 0 ? null : bomCsv(lines);
  }

  async massOf(faces: readonly StableRef[]): Promise<MassProperties | null> {
    return this.#exportSolid(faces, async (shape) => {
      const result = await this.#deps.kernel.massProperties(shape);
      return result.ok ? result.value : null;
    });
  }

  /** 3MF bytes, one object per visible body, in millimetres; only `faces`' bodies when given. */
  async export3mf(
    faces: readonly StableRef[] | null = null,
    tolerance?: TessellationOptions,
  ): Promise<Uint8Array | null> {
    return this.#enqueue(async () => {
      const rebuilt = await this.#build();
      const meshes = await bodyMeshes(this.#deps.kernel, rebuilt, this.#document, faces, tolerance);
      return meshes.length === 0 ? null : threeMf(meshes);
    });
  }

  /** Runs `write` on the solid of the picked bodies, or of everything. */
  async #exportSolid<T>(
    faces: readonly StableRef[] | null,
    write: (shape: import('@bezier/kernel').ShapeId, rebuilt: RebuildResult) => Promise<T | null>,
  ): Promise<T | null> {
    return this.#enqueue(async () => {
      const rebuilt = await this.#build();
      const solid = await solidOf(this.#deps.kernel, rebuilt, faces);
      if (solid === null) return null;
      try {
        return await write(solid.shape, rebuilt);
      } finally {
        if (solid.owned) await this.#deps.kernel.dispose(solid.shape);
      }
    });
  }

  async readDrawingState(): Promise<string | null> {
    return this.#lessonPreview ? null : this.#deps.store.readWorkspace(this.#id, 'drawings');
  }

  async saveDrawingState(text: string): Promise<void> {
    if (!this.#lessonPreview) await this.#deps.store.saveWorkspace(this.#id, 'drawings', text);
  }

  async drawingViews(
    sectionFraction?: number,
    faces: readonly StableRef[] | null = null,
  ): Promise<import('@bezier/kernel').DrawingProjection[]> {
    if (faces?.length === 0) return [];
    return (
      (await this.#exportSolid(faces, async (body) => {
        const views: import('@bezier/kernel').DrawingProjection[] = [];
        for (const direction of ['front', 'top', 'right', 'isometric'] as const) {
          const result = await this.#deps.kernel.projectDrawing(body, direction);
          if (!result.ok) throw new Error(result.error.message);
          views.push(result.value);
        }
        if (sectionFraction !== undefined) {
          const section = await this.#deps.kernel.sectionDrawing(body, sectionFraction);
          if (!section.ok) throw new Error(section.error.message);
          views.push(section.value);
        }
        return views;
      })) ?? []
    );
  }

  /**
   * STEP text for the current body, or null when there is nothing to export. Unlike STL it keeps
   * the exact geometry. The ShapeId stays inside this class, as above.
   */
  async exportStep(faces: readonly StableRef[] | null = null): Promise<Uint8Array | null> {
    return this.#exportSolid(faces, async (shape, rebuilt) => {
      const result = await this.#deps.kernel.exportStepFile(
        shape,
        await stepParts(this.#deps.kernel, rebuilt, this.#document),
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    });
  }
}
