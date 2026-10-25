/** Durability guarantees from ADR 0009, one test per failure mode the design must survive. */

import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../document.js';
import type { JournalEntry } from './journal.js';
import { apply, checksumOf, createEntry, invert, replay } from './journal.js';
import type { Operation } from './operations.js';

const AT = '2026-08-05T12:00:00.000Z';

function base() {
  return createEmptyDocument('Enclosure', () => new Date(AT));
}

function addExtrude(id: string, index = 0): Operation {
  return {
    op: 'addFeature',
    id,
    type: 'extrude',
    name: 'Extrude',
    index,
    params: { sketch: 'sketch-1', distance: 15 },
  };
}

function journalOf(...ops: Operation[]): JournalEntry[] {
  return ops.map((op, i) => createEntry(i + 1, op, AT));
}

describe('replay', () => {
  it('reconstructs a document from nothing but its history', () => {
    const entries = journalOf(
      addExtrude('extrude-1'),
      { op: 'updateParams', id: 'extrude-1', params: { sketch: 'sketch-1', distance: 22 } },
      { op: 'renameFeature', id: 'extrude-1', name: 'Body' },
    );

    const result = replay(base(), entries);

    expect(result.applied).toBe(3);
    expect(result.problem).toBeUndefined();
    expect(result.document.features).toHaveLength(1);
    expect(result.document.features[0]?.name).toBe('Body');
    expect(result.document.features[0]?.params.distance).toBe(22);
  });

  it('is deterministic — the same log always gives the same document', () => {
    const entries = journalOf(addExtrude('a'), addExtrude('b', 1), {
      op: 'moveFeature',
      id: 'b',
      toIndex: 0,
    });

    const first = replay(base(), entries);
    const second = replay(base(), entries);
    expect(JSON.stringify(first.document)).toBe(JSON.stringify(second.document));
  });

  it('never mutates the document it was given', () => {
    const original = base();
    const snapshot = JSON.stringify(original);

    replay(original, journalOf(addExtrude('extrude-1')));
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('surviving a damaged journal', () => {
  // The point of ADR 0009: a document damaged partway through returns everything up to the
  // damage. Refusing to open it is the worst response.

  it('keeps the good prefix when an entry is corrupted', () => {
    const entries = journalOf(
      addExtrude('extrude-1'),
      { op: 'renameFeature', id: 'extrude-1', name: 'Body' },
      { op: 'updateParams', id: 'extrude-1', params: { distance: 99 } },
    );

    // Simulate a flipped byte on disk: the operation no longer matches its checksum.
    const damaged = entries.map((entry, i) =>
      i === 2 ? { ...entry, checksum: 'deadbeef' } : entry,
    );

    const result = replay(base(), damaged);

    expect(result.applied).toBe(2);
    expect(result.problem).toEqual({ kind: 'checksum', seq: 3 });
    // The first two edits survived.
    expect(result.document.features[0]?.name).toBe('Body');
    expect(result.document.features[0]?.params.distance).toBe(15);
  });

  it('detects a missing entry rather than silently skipping it', () => {
    // A gap means a write was lost. Applying entry 3 on top of entry 1 would give a document that
    // looks right and is quietly wrong, which is worse than stopping and saying so.
    const entries = journalOf(addExtrude('a'), addExtrude('b', 1), addExtrude('c', 2));
    const withGap = entries.filter((_, i) => i !== 1);

    const result = replay(base(), withGap);

    expect(result.applied).toBe(1);
    expect(result.problem).toEqual({ kind: 'gap', expected: 2, found: 3 });
  });

  it('stops cleanly on an operation that cannot apply', () => {
    const entries = journalOf(addExtrude('extrude-1'), {
      op: 'updateParams',
      id: 'does-not-exist',
      params: {},
    });

    const result = replay(base(), entries);

    expect(result.applied).toBe(1);
    expect(result.problem?.kind).toBe('rejected');
    expect(result.document.features).toHaveLength(1);
  });

  it('tolerates an out-of-range insertion index instead of refusing the document', () => {
    // A file written by a build with different assumptions should still open.
    const result = replay(base(), journalOf(addExtrude('extrude-1', 999)));

    expect(result.applied).toBe(1);
    expect(result.document.features).toHaveLength(1);
  });
});

describe('checksums', () => {
  it('do not depend on the order keys were written in', () => {
    // Two code paths building the same operation must checksum identically, or a document
    // written by one and read by the other looks corrupted.
    const a: Operation = {
      op: 'addFeature',
      id: 'x',
      type: 'extrude',
      name: 'E',
      index: 0,
      params: { a: 1, b: 2 },
    };
    const b: Operation = {
      op: 'addFeature',
      index: 0,
      params: { b: 2, a: 1 },
      name: 'E',
      type: 'extrude',
      id: 'x',
    };

    expect(checksumOf(1, a)).toBe(checksumOf(1, b));
  });

  it('change when the operation changes', () => {
    expect(checksumOf(1, addExtrude('a'))).not.toBe(checksumOf(1, addExtrude('b')));
  });

  it('change when the sequence number changes', () => {
    // Otherwise a replayed entry could be silently accepted at the wrong position.
    expect(checksumOf(1, addExtrude('a'))).not.toBe(checksumOf(2, addExtrude('a')));
  });
});

describe('undo', () => {
  it('reverses every operation back to the exact prior document', () => {
    const operations: Operation[] = [
      { op: 'updateParams', id: 'extrude-1', params: { distance: 50 } },
      { op: 'renameFeature', id: 'extrude-1', name: 'Renamed' },
      { op: 'removeFeature', id: 'extrude-1' },
      { op: 'suppressFeature', id: 'extrude-1', suppressed: true },
      { op: 'renameDocument', name: 'Something else' },
      { op: 'setDisplayUnits', units: 'in' },
    ];

    const start = replay(base(), journalOf(addExtrude('extrude-1'))).document;
    const before = JSON.stringify(start);

    for (const op of operations) {
      const inverse = invert(start, op);
      expect(inverse).not.toBeNull();

      const forward = apply(start, op);
      expect(forward.ok).toBe(true);
      if (!forward.ok) continue;

      const back = apply(forward.document, inverse as Operation);
      expect(back.ok).toBe(true);
      if (!back.ok) continue;

      expect(JSON.stringify(back.document)).toBe(before);
    }
  });

  it('restores a deleted feature to its original position', () => {
    const start = replay(
      base(),
      journalOf(addExtrude('a'), addExtrude('b', 1), addExtrude('c', 2)),
    ).document;

    const remove: Operation = { op: 'removeFeature', id: 'b' };
    const inverse = invert(start, remove);

    const removed = apply(start, remove);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;

    const restored = apply(removed.document, inverse as Operation);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    expect(restored.document.features.map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });

  it('reports when an operation cannot be inverted rather than pretending', () => {
    // The caller must show "cannot undo" instead of quietly doing nothing.
    expect(invert(base(), { op: 'removeFeature', id: 'never-existed' })).toBeNull();
  });
});
