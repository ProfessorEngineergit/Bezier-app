/**
 * Keeps the kernel alive across crashes. OCCT can abort (out of memory, assertion, stack overflow)
 * and a WASM abort cannot be caught, so the kernel runs in a worker that this class restarts
 * (ADR 0009). It talks to a `SupervisedWorker`, which tests fake.
 */

export interface SupervisedWorker {
  /** Send a message. Buffers in `transfer` are moved, not copied. */
  post(message: unknown, transfer?: Transferable[]): void;
  /** Called for every message from the worker. */
  onMessage(handler: (message: unknown) => void): void;
  /** Called when the worker dies: an uncaught error, or an abort. */
  onFailure(handler: (reason: string) => void): void;
  terminate(): void;
}

export type WorkerFactory = () => SupervisedWorker | Promise<SupervisedWorker>;

export interface SupervisorOptions {
  /** How long a single call may take before the worker is presumed wedged. */
  timeoutMs?: number;
  /**
   * How many times one method may kill the worker before it is refused, so a reliably crashing
   * operation cannot cause an endless restart loop.
   */
  crashesBeforeRefusing?: number;
  /** Called after a restart, so the caller can rebuild from cached state. */
  onRestart?: (reason: string) => void;
  /** Parts of a large mesh as the worker makes them (`MeshPiece`). */
  onPiece?: (piece: import('../types.js').MeshPiece) => void;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_CRASHES_BEFORE_REFUSING = 2;

interface Pending {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  /**
   * Restarts the deadline, on an 'alive' message. `allowMs` is the silence a heavy piece announced,
   * never less than the call's own deadline.
   */
  rearm: (allowMs?: number) => void;
}

export class WorkerSupervisor {
  readonly #factory: WorkerFactory;
  readonly #timeoutMs: number;
  readonly #crashLimit: number;
  readonly #onRestart: ((reason: string) => void) | undefined;
  readonly #onPiece: SupervisorOptions['onPiece'];

  #worker: SupervisedWorker | null = null;
  #starting: Promise<SupervisedWorker> | null = null;
  #pending = new Map<number, Pending>();
  #nextId = 1;

  /** Methods that have killed the worker, and how often. The circuit breaker. */
  readonly #crashes = new Map<string, number>();

  restarts = 0;
  #disposed = false;

  constructor(factory: WorkerFactory, options: SupervisorOptions = {}) {
    this.#factory = factory;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#crashLimit = options.crashesBeforeRefusing ?? DEFAULT_CRASHES_BEFORE_REFUSING;
    this.#onRestart = options.onRestart;
    this.#onPiece = options.onPiece;
  }

  /** Whether a method has crashed often enough to be refused without trying. */
  isRefused(method: string): boolean {
    return (this.#crashes.get(method) ?? 0) >= this.#crashLimit;
  }

  /**
   * Runs one method in the worker. `timeoutMs` overrides the default for this call, for operations
   * whose duration grows with input (reading a large STEP file).
   */
  async call(
    method: string,
    args: readonly unknown[],
    transfer?: Transferable[],
    timeoutMs = this.#timeoutMs,
  ): Promise<unknown> {
    if (this.isRefused(method)) {
      throw new Error(
        `"${method}" has crashed the geometry engine repeatedly and is being skipped. ` +
          'This is a bug — please report the document.',
      );
    }

    const worker = await this.#ensureWorker();

    // A shutdown can land while the worker starts; without this check the call would register
    // against a terminated worker and never settle.
    if (this.#disposed) {
      throw new Error('the geometry engine was shut down');
    }

    const id = this.#nextId++;

    return new Promise((resolve, reject) => {
      // A wedged worker never replies; treat it as a crash.
      const deadline = () =>
        setTimeout(() => {
          this.#fail(`"${method}" did not answer for ${timeoutMs} ms`, method);
        }, timeoutMs);
      const pending: Pending = {
        method,
        resolve,
        reject,
        timer: deadline(),
        // The call's own deadline, or what a heavy piece announced.
        rearm: (allowMs = timeoutMs) => {
          clearTimeout(pending.timer);
          pending.timer = setTimeout(
            () => {
              this.#fail(`"${method}" did not answer for ${allowMs} ms`, method);
            },
            Math.max(allowMs, timeoutMs),
          );
        },
      };
      this.#pending.set(id, pending);
      worker.post({ kind: 'call', id, method, args }, transfer);
    });
  }

  async #ensureWorker(): Promise<SupervisedWorker> {
    if (this.#worker !== null) return this.#worker;
    if (this.#starting !== null) return this.#starting;

    this.#starting = (async () => {
      const worker = await this.#factory();
      this.#attach(worker);
      this.#worker = worker;
      this.#starting = null;
      return worker;
    })();

    return this.#starting;
  }

  /** Listen to `worker` for as long as it is this supervisor's (`release`, `adopt`). */
  #attach(worker: SupervisedWorker): void {
    worker.onMessage((message) => {
      if (this.#worker === worker) this.#receive(message);
    });
    worker.onFailure((reason) => {
      if (this.#worker === worker) this.#fail(reason, null);
    });
  }

  #receive(message: unknown): void {
    const reply = message as { kind?: string; id?: number; result?: unknown; message?: string };

    // The deadline measures silence, not duration: meshing a large assembly outlasts any deadline
    // that would catch a real hang. Every waiting call is rearmed, since calls queued behind a long
    // one are waiting, not wedged.
    if (reply.kind === 'alive') {
      const budget = (message as { budgetMs?: number }).budgetMs;
      for (const pending of this.#pending.values()) pending.rearm(budget);
      return;
    }
    // A part of a mesh in the making is also a sign of life.
    if (reply.kind === 'piece') {
      for (const pending of this.#pending.values()) pending.rearm();
      const piece = (message as { piece?: import('../types.js').MeshPiece }).piece;
      if (piece !== undefined) this.#onPiece?.(piece);
      return;
    }

    if (reply.id === undefined) return;
    const pending = this.#pending.get(reply.id);
    if (pending === undefined) return;

    clearTimeout(pending.timer);
    this.#pending.delete(reply.id);

    if (reply.kind === 'fault') {
      pending.reject(new Error(reply.message ?? 'the geometry engine reported a fault'));
      return;
    }
    pending.resolve(reply.result);
  }

  /**
   * The worker died or hung: rejects every call in flight and discards the worker so the next call
   * starts a fresh one.
   */
  #fail(reason: string, blamedMethod: string | null): void {
    // Blame whatever was running. With several calls in flight this over-blames, which is safe: a
    // wrongly refused method reports an error rather than looping.
    const blame = blamedMethod ?? [...this.#pending.values()].map((p) => p.method);
    for (const method of Array.isArray(blame) ? blame : [blame]) {
      this.#crashes.set(method, (this.#crashes.get(method) ?? 0) + 1);
    }

    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`the geometry engine restarted: ${reason}`));
    }
    this.#pending.clear();

    this.#worker?.terminate();
    this.#worker = null;
    this.#starting = null;
    this.restarts++;

    // The caller rebuilds from the cache, which holds the last good state (ADR 0007's
    // performance cache is ADR 0009's recovery cache).
    this.#onRestart?.(reason);
  }

  /**
   * Stops the running work at the user's request by ending the worker, since an OCCT call cannot
   * be interrupted. Not a crash: no method is blamed and the restart hook is not called.
   */
  cancel(): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('the geometry engine was stopped on request'));
    }
    this.#pending.clear();
    this.#worker?.terminate();
    this.#worker = null;
    this.#starting = null;
    this.restarts++;
  }

  /**
   * Hands the live worker to another supervisor to `adopt`, shutting this one down; null when there
   * is none or a call is still waiting on it.
   */
  release(): SupervisedWorker | null {
    const worker = this.#worker;
    if (worker === null || this.#pending.size > 0 || this.#starting !== null) return null;
    this.#worker = null;
    this.#disposed = true;
    return worker;
  }

  /**
   * Replaces this supervisor's worker with `worker`. The old geometry is gone and waiting calls are
   * rejected, as after `cancel`.
   */
  adopt(worker: SupervisedWorker): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('the geometry engine was replaced'));
    }
    this.#pending.clear();
    this.#worker?.terminate();
    this.#starting = null;
    this.#attach(worker);
    this.#worker = worker;
    this.restarts++;
  }

  /** Shut down. Pending calls are rejected and not left hanging. */
  dispose(): void {
    this.#disposed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('the geometry engine was shut down'));
    }
    this.#pending.clear();
    this.#worker?.terminate();
    this.#worker = null;
  }
}
