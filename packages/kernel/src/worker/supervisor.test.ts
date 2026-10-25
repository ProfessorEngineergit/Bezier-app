/** Supervision (ADR 0009), tested with a fake worker that can hang, die, and die repeatedly. */

import { describe, expect, it, vi } from 'vitest';
import type { SupervisedWorker } from './supervisor.js';
import { WorkerSupervisor } from './supervisor.js';

/** A worker that fails on demand. A real WASM abort would be slow and flaky to cause. */
class FakeWorker implements SupervisedWorker {
  #onMessage: ((message: unknown) => void) | null = null;
  #onFailure: ((reason: string) => void) | null = null;

  terminated = false;
  readonly received: { method: string; id: number }[] = [];

  /** Methods that will never be answered. */
  hangOn = new Set<string>();
  /** Methods that kill the worker. */
  dieOn = new Set<string>();

  /**
   * What the real worker sends between the pieces of long work, and with `budgetMs` before a heavy
   * piece that cannot report halfway.
   */
  alive(budgetMs?: number): void {
    this.#onMessage?.(budgetMs === undefined ? { kind: 'alive' } : { kind: 'alive', budgetMs });
  }

  post(message: unknown): void {
    const call = message as { id: number; method: string };
    this.received.push({ method: call.method, id: call.id });

    if (this.dieOn.has(call.method)) {
      queueMicrotask(() => this.#onFailure?.(`worker aborted in ${call.method}`));
      return;
    }
    if (this.hangOn.has(call.method)) return;

    queueMicrotask(() => {
      this.#onMessage?.({ kind: 'result', id: call.id, result: { ok: true, value: 'done' } });
    });
  }

  onMessage(handler: (message: unknown) => void): void {
    this.#onMessage = handler;
  }

  onFailure(handler: (reason: string) => void): void {
    this.#onFailure = handler;
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('normal operation', () => {
  it('round-trips a call', async () => {
    const supervisor = new WorkerSupervisor(() => new FakeWorker());
    await expect(supervisor.call('tessellate', [])).resolves.toEqual({ ok: true, value: 'done' });
    supervisor.dispose();
  });

  it('starts the worker once and reuses it', async () => {
    let created = 0;
    const supervisor = new WorkerSupervisor(() => {
      created++;
      return new FakeWorker();
    });

    await Promise.all([
      supervisor.call('a', []),
      supervisor.call('b', []),
      supervisor.call('c', []),
    ]);
    expect(created).toBe(1);
    supervisor.dispose();
  });
});

describe('when the worker dies', () => {
  it('rejects the call rather than leaving it hanging', async () => {
    // A promise that never settles is worse than a crash: the app looks frozen and the user
    // has no idea why.
    const worker = new FakeWorker();
    worker.dieOn.add('fillet');
    const supervisor = new WorkerSupervisor(() => worker);

    await expect(supervisor.call('fillet', [])).rejects.toThrow(/restarted/);
    supervisor.dispose();
  });

  it('rejects everything else that was in flight too', async () => {
    const worker = new FakeWorker();
    worker.hangOn.add('slow');
    worker.dieOn.add('crash');
    const supervisor = new WorkerSupervisor(() => worker);

    const slow = supervisor.call('slow', []);
    const crash = supervisor.call('crash', []);

    await expect(crash).rejects.toThrow();
    await expect(slow).rejects.toThrow(/restarted/);
    supervisor.dispose();
  });

  it('terminates the dead worker and starts a fresh one', async () => {
    const workers: FakeWorker[] = [];
    const supervisor = new WorkerSupervisor(() => {
      const worker = new FakeWorker();
      if (workers.length === 0) worker.dieOn.add('boom');
      workers.push(worker);
      return worker;
    });

    await expect(supervisor.call('boom', [])).rejects.toThrow();
    expect(workers[0]?.terminated).toBe(true);

    // The next call works, on a new instance. A pause, not a lost session.
    await expect(supervisor.call('tessellate', [])).resolves.toBeDefined();
    expect(workers).toHaveLength(2);
    expect(supervisor.restarts).toBe(1);
    supervisor.dispose();
  });

  it('tells the caller so it can rebuild from cache', async () => {
    const onRestart = vi.fn();
    const worker = new FakeWorker();
    worker.dieOn.add('boom');
    const supervisor = new WorkerSupervisor(() => worker, { onRestart });

    await expect(supervisor.call('boom', [])).rejects.toThrow();
    expect(onRestart).toHaveBeenCalledOnce();
    supervisor.dispose();
  });
});

describe('when the worker hangs', () => {
  it('gives up after the deadline and treats it as a crash', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    worker.hangOn.add('wedged');
    const supervisor = new WorkerSupervisor(() => worker, { timeoutMs: 1000 });

    // The rejection handler is attached before the clock moves. Otherwise the promise rejects
    // during advanceTimers with nothing listening and Node reports an unhandled rejection.
    const settled = supervisor.call('wedged', []).catch((error: unknown) => error);

    // Let the worker be created, then run past the deadline.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1001);

    expect(String(await settled)).toMatch(/did not answer/);
    expect(worker.terminated).toBe(true);

    supervisor.dispose();
    vi.useRealTimers();
  });

  it('gives a slow call its own, longer budget', async () => {
    // Reading a large STEP file takes minutes, far past the default deadline.
    vi.useFakeTimers();
    const worker = new FakeWorker();
    worker.hangOn.add('importStep');
    const supervisor = new WorkerSupervisor(() => worker, { timeoutMs: 1000 });

    const settled = supervisor
      .call('importStep', [], undefined, 5000)
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1001);
    expect(worker.terminated).toBe(false);

    await vi.advanceTimersByTimeAsync(4000);
    expect(String(await settled)).toMatch(/for 5000 ms/);
    expect(worker.terminated).toBe(true);

    supervisor.dispose();
    vi.useRealTimers();
  });
});

describe('long work that says it is alive', () => {
  it('is not taken for a hang, however long it runs', async () => {
    // Meshing the Voron assembly takes over 30 s, past a fixed deadline.
    vi.useFakeTimers();
    const worker = new FakeWorker();
    worker.hangOn.add('tessellate');
    const supervisor = new WorkerSupervisor(() => worker, { timeoutMs: 1000 });
    worker.hangOn.add('extractEdges');
    const settled = supervisor.call('tessellate', []).catch((error: unknown) => error);
    // Asked for at the same moment, and queued in the worker behind the mesh.
    const queued = supervisor.call('extractEdges', []).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    for (let second = 0; second < 10; second++) {
      await vi.advanceTimersByTimeAsync(900);
      worker.alive();
    }
    expect(worker.terminated).toBe(false);

    // Silence again: now it is a hang, for both.
    await vi.advanceTimersByTimeAsync(1001);
    expect(String(await settled)).toMatch(/did not answer/);
    expect(String(await queued)).toMatch(/restarted/);
    expect(worker.terminated).toBe(true);

    supervisor.dispose();
    vi.useRealTimers();
  });
});

describe('a heavy piece that says how long it may take', () => {
  it('is waited for that long, and not for a moment more', async () => {
    // A speaker grille of 4,662 faces took 46 s to mesh in one call. Announced with a budget, that
    // silence is not a hang.
    vi.useFakeTimers();
    const worker = new FakeWorker();
    worker.hangOn.add('tessellate');
    const supervisor = new WorkerSupervisor(() => worker, { timeoutMs: 1000 });
    const settled = supervisor.call('tessellate', []).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    worker.alive(5000);
    await vi.advanceTimersByTimeAsync(4900);
    expect(worker.terminated).toBe(false);
    // The budget is spent: a hang after all.
    await vi.advanceTimersByTimeAsync(200);
    expect(String(await settled)).toMatch(/did not answer for 5000 ms/);
    expect(worker.terminated).toBe(true);
    supervisor.dispose();
    vi.useRealTimers();
  });

  it("goes back to the call's own deadline with the next ordinary word", async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    worker.hangOn.add('tessellate');
    const supervisor = new WorkerSupervisor(() => worker, { timeoutMs: 1000 });
    const settled = supervisor.call('tessellate', []).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    worker.alive(60_000);
    await vi.advanceTimersByTimeAsync(2000);
    worker.alive();
    await vi.advanceTimersByTimeAsync(1001);
    expect(String(await settled)).toMatch(/did not answer for 1000 ms/);
    supervisor.dispose();
    vi.useRealTimers();
  });
});

describe('the circuit breaker', () => {
  it('refuses a method that keeps killing the worker', async () => {
    // Without this, a reliably crashing operation becomes an endless restart loop, worse than
    // the crash because the app never recovers enough to explain itself.
    const supervisor = new WorkerSupervisor(
      () => {
        const worker = new FakeWorker();
        worker.dieOn.add('poison');
        return worker;
      },
      { crashesBeforeRefusing: 2 },
    );

    await expect(supervisor.call('poison', [])).rejects.toThrow(/restarted/);
    await expect(supervisor.call('poison', [])).rejects.toThrow(/restarted/);

    expect(supervisor.isRefused('poison')).toBe(true);
    // Refused without even starting a worker, and the message says why.
    await expect(supervisor.call('poison', [])).rejects.toThrow(/repeatedly/);

    supervisor.dispose();
  });

  it('does not punish operations that were merely nearby', async () => {
    const supervisor = new WorkerSupervisor(
      () => {
        const worker = new FakeWorker();
        worker.dieOn.add('poison');
        return worker;
      },
      { crashesBeforeRefusing: 2 },
    );

    await expect(supervisor.call('poison', [])).rejects.toThrow();
    await expect(supervisor.call('poison', [])).rejects.toThrow();

    expect(supervisor.isRefused('poison')).toBe(true);
    expect(supervisor.isRefused('tessellate')).toBe(false);
    supervisor.dispose();
  });
});

describe('shutdown', () => {
  it('rejects a call that arrives while the worker is still starting', async () => {
    // dispose() can land in the middle of an asynchronous worker start. Without a guard the
    // call registers against a terminated worker and hangs, which is worse than any error.
    const supervisor = new WorkerSupervisor(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new FakeWorker();
    });

    const settled = supervisor.call('anything', []).catch((error: unknown) => error);
    supervisor.dispose();

    expect(String(await settled)).toMatch(/shut down/);
  });

  it('rejects pending calls instead of leaving them', async () => {
    const worker = new FakeWorker();
    worker.hangOn.add('slow');
    const supervisor = new WorkerSupervisor(() => worker);

    const settled = supervisor.call('slow', []).catch((error: unknown) => error);
    // Wait until the call has reached the worker, not a guessed number of microtask ticks.
    await vi.waitFor(() => expect(worker.received).toHaveLength(1));

    supervisor.dispose();
    expect(String(await settled)).toMatch(/shut down/);
  });

  describe('stopping on request', () => {
    it('rejects what is running, starts afresh, and does not tell the caller anything broke', async () => {
      const onRestart = vi.fn();
      const workers: FakeWorker[] = [];
      const supervisor = new WorkerSupervisor(
        () => {
          const worker = new FakeWorker();
          if (workers.length === 0) worker.hangOn.add('slow');
          workers.push(worker);
          return worker;
        },
        { onRestart },
      );
      const slow = supervisor.call('slow', []);
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      supervisor.cancel();
      await expect(slow).rejects.toThrow(/stopped on request/);
      expect(workers[0]?.terminated).toBe(true);
      expect(onRestart).not.toHaveBeenCalled();
      await expect(supervisor.call('tessellate', [])).resolves.toBeDefined();
      expect(workers).toHaveLength(2);
      supervisor.dispose();
    });

    it('never counts as a crash, however often it is asked for', async () => {
      const supervisor = new WorkerSupervisor(() => {
        const worker = new FakeWorker();
        worker.hangOn.add('slow');
        return worker;
      });
      for (let i = 0; i < 5; i++) {
        const slow = supervisor.call('slow', []);
        await new Promise((resolve) => setTimeout(resolve, 0));
        supervisor.cancel();
        await expect(slow).rejects.toThrow();
      }
      expect(supervisor.isRefused('slow')).toBe(false);
      supervisor.dispose();
    });
  });
});
