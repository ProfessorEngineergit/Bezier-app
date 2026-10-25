/**
 * Keeps one open live project current: sends this device's edits in order, polls for others'
 * and reports when the shown model changes. Offline, edits wait on the device (saved via
 * `onSaved`); missed edits are fetched, from a checkpoint if they have been trimmed.
 *
 * The model rules are in live-state.ts.
 */

import type { ArrivedEdit, LiveChannel } from './live.ts';
import { type LiveEdit, type LiveModel, LiveState } from './live-state.ts';

export type LiveStatus = 'live' | 'offline';

export interface LiveSnapshot<Doc, Op> {
  readonly seq: number;
  readonly confirmed: Doc;
  readonly pending: readonly LiveEdit<Op>[];
}

export interface LiveSyncOptions<Doc, Op> {
  channel: LiveChannel<Doc, Op>;
  model: LiveModel<Doc, Op>;
  /** Where to start: from `LiveSync.load`, or what `onSaved` last saved. */
  from: LiveSnapshot<Doc, Op>;
  /** Whether this device may send edits and write checkpoints. */
  canWrite: boolean;
  /**
   * Others' edits arrived: show `target`. Awaited before anything else is taken in, so the
   * app never has two of these running.
   */
  onChange(target: Doc, edits: readonly ArrivedEdit<Op>[]): Promise<void> | void;
  /** Keep this, so edits not yet sent survive the app closing. */
  onSaved?(snapshot: LiveSnapshot<Doc, Op>): Promise<void> | void;
  onStatus?(status: LiveStatus): void;
  /** Write a checkpoint every this many edits. */
  checkpointEvery?: number;
}

const RETRY_MS = [1000, 2000, 5000, 10_000, 15_000];

export class LiveSync<Doc, Op> {
  readonly #options: LiveSyncOptions<Doc, Op>;
  readonly #state: LiveState<Doc, Op>;
  readonly #abort = new AbortController();
  #running = false;
  #sending: Promise<void> | null = null;
  /** Sent and not yet back from the server. */
  readonly #sent = new Set<string>();
  #status: LiveStatus = 'live';

  constructor(options: LiveSyncOptions<Doc, Op>) {
    this.#options = options;
    this.#state = new LiveState(
      options.model,
      options.from.confirmed,
      options.from.seq,
      options.from.pending,
    );
  }

  /** A project from nothing: its checkpoint and every edit since. Null if it is not live. */
  static async load<Doc, Op>(
    channel: LiveChannel<Doc, Op>,
    model: LiveModel<Doc, Op>,
  ): Promise<{ seq: number; document: Doc } | null> {
    const first = await channel.start();
    if (first === null) return null;
    const state = new LiveState(model, first.checkpoint.document, first.checkpoint.seq);
    state.receive(first.edits);
    let known = first.seq;
    while (state.seq < known) {
      const more = await channel.poll(state.seq, false);
      if (more.edits.length === 0) break;
      state.receive(more.edits);
      known = more.seq;
    }
    return { seq: state.seq, document: state.confirmed };
  }

  get status(): LiveStatus {
    return this.#status;
  }

  get target(): Doc {
    return this.#state.target;
  }

  get snapshot(): LiveSnapshot<Doc, Op> {
    return { seq: this.#state.seq, confirmed: this.#state.confirmed, pending: this.#state.pending };
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#send();
    void this.#loop();
  }

  /** Stops waiting. Edits not yet sent stay in `snapshot` for next time. */
  async stop(): Promise<void> {
    this.#running = false;
    this.#abort.abort();
    await this.#sending?.catch(() => undefined);
  }

  /** An edit made here, already on screen. */
  edit(ops: readonly Op[]): void {
    if (ops.length === 0 || !this.#options.canWrite) return;
    this.#state.local(ops);
    void this.#save();
    this.#send();
  }

  /** Sends what waits, in order, one at a time; retried until it goes or this stops. */
  #send(): void {
    if (this.#sending !== null || !this.#running) return;
    this.#sending = (async () => {
      let failures = 0;
      while (this.#running) {
        const next = this.#unsent();
        if (next === undefined) break;
        try {
          await this.#options.channel.send(next);
          this.#sent.add(next.id);
          failures = 0;
          this.#setStatus('live');
        } catch {
          this.#setStatus('offline');
          await this.#pause(RETRY_MS[Math.min(failures++, RETRY_MS.length - 1)] ?? 15_000);
        }
      }
    })().finally(() => {
      this.#sending = null;
      // An edit made in the moment between the last check and here.
      if (this.#running && this.#unsent() !== undefined) this.#send();
    });
  }

  #unsent(): LiveEdit<Op> | undefined {
    const pending = this.#state.pending;
    for (const id of this.#sent) if (!pending.some((edit) => edit.id === id)) this.#sent.delete(id);
    return pending.find((edit) => !this.#sent.has(edit.id));
  }

  async #loop(): Promise<void> {
    let failures = 0;
    while (this.#running) {
      try {
        const res = await this.#options.channel.poll(this.#state.seq, true, this.#abort.signal);
        if (!this.#running) return;
        this.#setStatus('live');
        failures = 0;
        let changed = false;
        if (res.checkpoint !== undefined && res.checkpoint.seq > this.#state.seq) {
          this.#state.reset(res.checkpoint.document, res.checkpoint.seq);
          changed = true;
          // Sent edits may or may not be in the checkpoint; resend them, since the server
          // deduplicates by id.
          this.#sent.clear();
          this.#send();
        }
        const before = this.#state.seq;
        try {
          changed = this.#state.receive(res.edits) || changed;
        } catch {
          // A gap: keep what was applied and ask again for the rest.
          changed = this.#state.seq !== before || changed;
        }
        if (changed) {
          await this.#options.onChange(
            this.#state.target,
            res.edits.filter((e) => e.seq > before),
          );
        }
        await this.#save();
        await this.#maybeCheckpoint(before);
      } catch {
        if (!this.#running) return;
        this.#setStatus('offline');
        await this.#pause(RETRY_MS[Math.min(failures++, RETRY_MS.length - 1)] ?? 15_000);
      }
    }
  }

  /** One device writes a checkpoint each time the count passes a multiple; more is harmless. */
  async #maybeCheckpoint(before: number): Promise<void> {
    const every = this.#options.checkpointEvery ?? 100;
    const now = this.#state.seq;
    if (!this.#options.canWrite || Math.floor(now / every) === Math.floor(before / every)) return;
    await this.#options.channel.checkpoint(now, this.#state.confirmed).catch(() => undefined);
  }

  async #save(): Promise<void> {
    await this.#options.onSaved?.(this.snapshot);
  }

  #setStatus(status: LiveStatus): void {
    if (status === this.#status) return;
    this.#status = status;
    this.#options.onStatus?.(status);
  }

  #pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.#abort.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
