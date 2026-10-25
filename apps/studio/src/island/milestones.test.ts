import { describe, expect, it } from 'vitest';
import { firstOf, MILESTONES_KEY } from './milestones.js';

function memory(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const extrude = { kind: 'edit', op: 'addFeature', type: 'extrude' } as const;

describe('firsts', () => {
  it('are said once, ever', () => {
    const storage = memory();
    expect(firstOf(extrude, storage, false)).toBe('Your first solid. It is real now.');
    expect(firstOf(extrude, storage, false)).toBeNull();
    expect(firstOf({ ...extrude, type: 'revolve' }, storage, false)).toBeNull();
  });

  it('count during a lesson but are not said there', () => {
    const storage = memory();
    expect(firstOf(extrude, storage, true)).toBeNull();
    expect(firstOf(extrude, storage, false)).toBeNull();
  });

  it('hear an export only when it worked', () => {
    const storage = memory();
    const failed = { kind: 'notice', tone: 'fail', title: 'Could not export a.step' } as const;
    expect(firstOf(failed, storage, false)).toBeNull();
    const done = { kind: 'notice', tone: 'ok', title: 'Exported a.step' } as const;
    expect(firstOf(done, storage, false)).toMatch(/first export/);
  });

  it('ignore what is not a first at all', () => {
    const storage = memory();
    expect(firstOf({ kind: 'edit', op: 'rename' }, storage, false)).toBeNull();
    expect(storage.data.has(MILESTONES_KEY)).toBe(false);
  });

  it('survive a broken memory', () => {
    const storage = memory();
    storage.data.set(MILESTONES_KEY, '{nope');
    expect(firstOf({ kind: 'edit', op: 'addFeature', type: 'sketch' }, storage, false)).toBe(
      'Your first sketch.',
    );
  });
});
