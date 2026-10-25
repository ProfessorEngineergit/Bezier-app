import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isManifest } from './manifest.js';
import { readPackage, writePackage } from './package.js';

const SAMPLE = new URL('../../samples/box-extrude.bezierlesson', import.meta.url);

describe('a .bezierlesson package', () => {
  it('reads the sample the Bezier editor exported', async () => {
    const lesson = await readPackage(new Uint8Array(readFileSync(SAMPLE)));
    expect(isManifest(lesson.manifest)).toBe(true);
    expect(lesson.manifest.states.length).toBeGreaterThan(0);
    expect(lesson.viewport.size).toBeGreaterThan(0);
    expect(lesson.manifest.completed).toBe(false);
  });

  it('comes back the same through a write and a read', async () => {
    const lesson = await readPackage(new Uint8Array(readFileSync(SAMPLE)));
    const again = await readPackage(await writePackage(lesson));
    expect({ ...again.manifest, id: '' }).toEqual({ ...lesson.manifest, id: '' });
    expect(again.viewport.size).toBe(lesson.viewport.size);
  });

  it('refuses what is not a lesson, in words a person can act on', async () => {
    await expect(readPackage(new Uint8Array([1, 2, 3]))).rejects.toThrow();
    expect(isManifest({ format: 'bezier-lesson', version: 2 })).toBe(false);
  });
});
