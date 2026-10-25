import type { CadDocument } from '@bezier/core';
import { describe, expect, it } from 'vitest';
import type { Session } from './session.js';
import { documentWeight, SessionKeep } from './session-keep.js';

const held = (id: string, characters: number): Session =>
  ({
    id,
    document: {
      meta: {},
      features: [
        { id: 'f', type: 'import-step', name: 'Import', params: { file: 'x'.repeat(characters) } },
      ],
    } as unknown as CadDocument,
  }) as unknown as Session;

const FEATURE = 2_000;

describe('kept projects', () => {
  it('weighs a document by its texts and a little for each feature', () => {
    expect(documentWeight(held('a', 5_000).document)).toBe(FEATURE + 5_000);
  });

  it('hands a kept project back once and as it was', () => {
    const keep = new SessionKeep(1_000_000);
    const session = held('big', 100);
    keep.keep(session);
    expect(keep.take('big')).toBe(session);
    expect(keep.take('big')).toBeNull();
  });

  it('keeps a big project beside a small one in use', () => {
    const keep = new SessionKeep(500_000);
    keep.keep(held('big', 300_000));
    keep.fit(FEATURE + 1_000);
    expect(keep.ids).toEqual(['big']);
  });

  it('lets the big one go when what is open outweighs the budget with it', () => {
    const keep = new SessionKeep(500_000);
    keep.keep(held('big', 300_000));
    keep.fit(FEATURE + 400_000);
    expect(keep.ids).toEqual([]);
  });

  it('lets go of the one left longest ago first', () => {
    const keep = new SessionKeep(500_000);
    keep.keep(held('old', 200_000));
    keep.keep(held('recent', 200_000));
    keep.fit(FEATURE + 150_000);
    expect(keep.ids).toEqual(['recent']);
  });

  it('forgets a project deleted meanwhile', () => {
    const keep = new SessionKeep();
    keep.keep(held('gone', 10));
    keep.forget('gone');
    expect(keep.take('gone')).toBeNull();
  });
});
