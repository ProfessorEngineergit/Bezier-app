/** What the client sends across the thread boundary is what the caller asked for. */
import { expect, it, vi } from 'vitest';
import { WorkerKernel } from './client.js';
import type { WorkerSupervisor } from './supervisor.js';

it('sends the options of a union to the worker, or the seam is never taken out in the app', async () => {
  const call = vi.fn(async () => ({ ok: true, value: null }));
  const kernel = new WorkerKernel({ call } as unknown as WorkerSupervisor);
  await kernel.fuse(1 as never, 2 as never, { merge: true });
  expect(call).toHaveBeenCalledWith('fuse', [1, 2, { merge: true }], undefined, undefined);
  await kernel.fuse(1 as never, 2 as never);
  expect(call).toHaveBeenLastCalledWith('fuse', [1, 2], undefined, undefined);
});
