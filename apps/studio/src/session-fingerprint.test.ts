/**
 * The document fingerprint undo histories are saved under must not change: a different value would
 * throw away every saved history on the next open.
 */

import { type CadDocument, createEmptyDocument } from '@bezier/core';
import { expect, it } from 'vitest';
import { fingerprint } from './session-history.js';

/** The fingerprint as it was first written: FNV-1a over the whole text at once. */
function reference(document: CadDocument): string {
  const canonical = (value: unknown): string => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  };
  const { modifiedAt: _modified, ...meta } = document.meta;
  const text = canonical({ meta, features: document.features });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16)}:${text.length}`;
}

const feature = (id: string, distance: number) => ({
  id,
  type: 'extrude',
  name: id,
  params: { sketch: 'sketch-1', distance, note: undefined },
});

it('gives the value it always gave, however the document got there', () => {
  const empty = createEmptyDocument('Doc');
  expect(fingerprint(empty)).toBe(reference(empty));

  const first = { ...empty, features: [feature('a', 1), feature('b', 2)] };
  expect(fingerprint(first)).toBe(reference(first));

  // A feature added at the end: the earlier ones come from memory.
  const [a, b] = first.features;
  if (a === undefined || b === undefined) throw new Error('no features');
  const added = { ...first, features: [a, b, feature('c', 3)] };
  expect(fingerprint(added)).toBe(reference(added));

  // One changed in the middle, and one removed: what follows is worked out again.
  const changed = { ...added, features: [a, feature('b', 5), ...added.features.slice(2)] };
  expect(fingerprint(changed)).toBe(reference(changed));
  const removed = { ...added, features: [b] };
  expect(fingerprint(removed)).toBe(reference(removed));
});
