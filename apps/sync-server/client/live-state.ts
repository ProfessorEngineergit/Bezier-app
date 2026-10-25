/**
 * Local state of a live project, without networking: the model from all edits in server
 * order (`confirmed`) plus this device's edits not yet confirmed (`pending`). The screen shows
 * `pending` applied to `confirmed`.
 *
 * Every operation carries the full state of what it touches (an `updateParams` holds every
 * parameter; ADR 0009), so applying edits in server order gives the same model on every
 * device and concurrent changes resolve to the later one. An operation that no longer applies
 * is skipped, identically on every device.
 *
 * Generic over document and operation types; the app passes `@bezier/core`'s `apply`.
 */

export interface LiveModel<Doc, Op> {
  /** The document after `op`, or null when `op` does not apply to it. Never throws. */
  apply(document: Doc, op: Op): Doc | null;
}

/** One user's edit, as the server keeps it. */
export interface LiveEdit<Op> {
  /** Chosen by the device that made it; how it recognises its own when they come back. */
  readonly id: string;
  readonly ops: readonly Op[];
}

/** A live edit in its place in the server's order. */
export interface Sequenced<Op> extends LiveEdit<Op> {
  readonly seq: number;
}

export class LiveState<Doc, Op> {
  readonly #model: LiveModel<Doc, Op>;
  #confirmed: Doc;
  #seq: number;
  #pending: LiveEdit<Op>[];

  constructor(
    model: LiveModel<Doc, Op>,
    confirmed: Doc,
    seq: number,
    pending: readonly LiveEdit<Op>[] = [],
  ) {
    this.#model = model;
    this.#confirmed = confirmed;
    this.#seq = seq;
    this.#pending = [...pending];
  }

  /** The last edit in the server's order that this device has. */
  get seq(): number {
    return this.#seq;
  }

  get confirmed(): Doc {
    return this.#confirmed;
  }

  /** Edits made here that the server has not yet sent back, oldest first. */
  get pending(): readonly LiveEdit<Op>[] {
    return this.#pending;
  }

  /** What this device shows: everyone's edits so far, then its own still on their way. */
  get target(): Doc {
    return this.#applyAll(
      this.#confirmed,
      this.#pending.flatMap((edit) => edit.ops),
    );
  }

  /** An edit made here. Returns it as it is to be sent. */
  local(ops: readonly Op[]): LiveEdit<Op> {
    const edit = { id: newEditId(), ops };
    this.#pending.push(edit);
    return edit;
  }

  /**
   * Edits from the server, in its order. Returns whether the model shown here has to
   * change: false when everything that arrived was this device's own, already on screen.
   *
   * An edit at or before `seq` was seen already and is passed over. A gap means some were
   * missed; that is the caller's to fix (ask again from `seq`), so it throws.
   */
  receive(edits: readonly Sequenced<Op>[]): boolean {
    let others = false;
    for (const edit of [...edits].sort((a, b) => a.seq - b.seq)) {
      if (edit.seq <= this.#seq) continue;
      if (edit.seq !== this.#seq + 1) {
        throw new Error(
          `Live edits arrived with a gap: expected ${this.#seq + 1}, got ${edit.seq}.`,
        );
      }
      this.#confirmed = this.#applyAll(this.#confirmed, edit.ops);
      this.#seq = edit.seq;
      const mine = this.#pending.findIndex((p) => p.id === edit.id);
      if (mine === 0) {
        this.#pending.shift();
      } else {
        if (mine > 0) this.#pending.splice(mine, 1);
        others = true;
      }
    }
    return others;
  }

  /**
   * Start again from a checkpoint (a whole document at `seq`), keeping the edits not yet
   * sent back. For a device that was away longer than the server keeps single edits.
   */
  reset(confirmed: Doc, seq: number): void {
    this.#confirmed = confirmed;
    this.#seq = seq;
  }

  /** Forget an edit made here: the server says it already has it (it was sent before). */
  drop(id: string): void {
    this.#pending = this.#pending.filter((edit) => edit.id !== id);
  }

  #applyAll(document: Doc, ops: readonly Op[]): Doc {
    let doc = document;
    for (const op of ops) doc = this.#model.apply(doc, op) ?? doc;
    return doc;
  }
}

function newEditId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
