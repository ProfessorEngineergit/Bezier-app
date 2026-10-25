import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: async () => 8 * 2 ** 30,
}));

describe('whether a STEP file fits in this machine', () => {
  it('says nothing until the machine has said how much memory it has', async () => {
    const memory = await import('./machine-memory.js');
    expect(memory.importTooLarge(241e6)).toBeNull();
  });

  it('warns about the Voron on an 8 GB machine, and not about a part', async () => {
    const memory = await import('./machine-memory.js');
    await memory.learnMachineMemory();
    expect(memory.importTooLarge(241e6)).toEqual({ need: '9.0 GB', have: '8.0 GB' });
    expect(memory.importTooLarge(15e6)).toBeNull();
    expect((globalThis as { __bezierMemoryBytes?: number }).__bezierMemoryBytes).toBe(8 * 2 ** 30);
  });
});
