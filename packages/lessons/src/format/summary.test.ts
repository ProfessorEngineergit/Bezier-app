import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readPackage } from './package.js';
import { levelWord, matches, newestFirst, sizeWords, summarize } from './summary.js';

const SAMPLE = new URL('../../samples/box-extrude.bezierlesson', import.meta.url);

describe('a lesson summary', () => {
  it('has what the home lists, and no model text', async () => {
    const lesson = await readPackage(new Uint8Array(readFileSync(SAMPLE)));
    const summary = summarize(lesson.manifest, lesson.viewport.size);
    expect(summary.title).toBe('New lesson');
    expect(summary.chapters.map((c) => c.title)).toEqual(['Start', 'Add Sketch', 'Add Extrude']);
    expect(summary.chapters[1]?.time).toBeCloseTo(0.4045);
    expect(summary.length).toBeCloseTo(0.7875);
    expect(summary.hasCamera).toBe(false);
    expect(summary.bytes).toBe(lesson.viewport.size);
    expect(JSON.stringify(summary)).not.toContain('features');
  });

  it('is found by its chapters as well as its title', async () => {
    const lesson = await readPackage(new Uint8Array(readFileSync(SAMPLE)));
    const summary = summarize(lesson.manifest, 0);
    expect(matches(summary, 'extrude')).toBe(true);
    expect(matches(summary, '  NEW ')).toBe(true);
    expect(matches(summary, 'fillet')).toBe(false);
    expect(matches(summary, '')).toBe(true);
  });

  it('sorts newest first', () => {
    const a = { createdAt: '2026-01-01' } as Parameters<typeof newestFirst>[0];
    const b = { createdAt: '2026-02-01' } as Parameters<typeof newestFirst>[0];
    expect([a, b].sort(newestFirst)).toEqual([b, a]);
  });

  it('says sizes and levels in words', () => {
    expect(sizeWords(81096)).toBe('81 kB');
    expect(sizeWords(240_000_000)).toBe('240.0 MB');
    expect(levelWord('beginner')).toBe('Beginner');
    expect(levelWord(undefined)).toBe('Any level');
  });
});
