/**
 * `diffOperations`: applying its result to the first document gives the second. Checked against
 * many generated pairs of divergent documents, not only hand-picked ones.
 */

import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../document.js';
import { diffOperations, sameDocument } from './diff.js';
import { apply } from './journal.js';
import type { Operation } from './operations.js';

const AT = () => new Date('2026-10-07T12:00:00.000Z');

function applyAll(document = createEmptyDocument('Part', AT), ops: readonly Operation[] = []) {
  let doc = document;
  for (const op of ops) {
    const next = apply(doc, op);
    if (next.ok) doc = next.document;
  }
  return doc;
}

/** A small deterministic generator, so a failure names the seed that reproduces it. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomEdits(seed: number, count: number, prefix: string): Operation[] {
  const next = random(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
  const ids = ['a', 'b', 'c', 'd', `${prefix}-x`, `${prefix}-y`];
  const ops: Operation[] = [];
  for (let i = 0; i < count; i++) {
    const id = pick(ids);
    const kind = pick([
      'add',
      'add',
      'update',
      'rename',
      'remove',
      'move',
      'suppress',
      'expr',
      'var',
      'meta',
    ]);
    if (kind === 'add')
      ops.push({
        op: 'addFeature',
        id,
        type: pick(['sketch', 'extrude']),
        name: `F ${id}`,
        index: Math.floor(next() * 5),
        params: { distance: Math.floor(next() * 50) },
      });
    if (kind === 'update')
      ops.push({ op: 'updateParams', id, params: { distance: Math.floor(next() * 50) } });
    if (kind === 'rename') ops.push({ op: 'renameFeature', id, name: `${prefix} ${i}` });
    if (kind === 'remove') ops.push({ op: 'removeFeature', id });
    if (kind === 'move') ops.push({ op: 'moveFeature', id, toIndex: Math.floor(next() * 5) });
    if (kind === 'suppress') ops.push({ op: 'suppressFeature', id, suppressed: next() > 0.5 });
    if (kind === 'expr')
      ops.push({
        op: 'setExpression',
        id,
        param: 'distance',
        expression: next() > 0.3 ? `w * ${i}` : '',
      });
    if (kind === 'var')
      ops.push({
        op: 'setVariable',
        name: pick(['w', 'h', 'depth']),
        expression: next() > 0.3 ? String(i) : '',
        index: Math.floor(next() * 3),
      });
    if (kind === 'meta')
      ops.push(
        pick<Operation>([
          { op: 'renameDocument', name: `${prefix} part` },
          { op: 'setDisplayUnits', units: pick(['mm', 'cm', 'in'] as const) },
          { op: 'setBodyVisible', key: pick(ids), visible: next() > 0.5 },
          { op: 'renameBody', key: pick(ids), name: next() > 0.3 ? `Body ${i}` : '' },
          { op: 'setBodyFolder', key: pick(ids), folder: next() > 0.3 ? 'Frame' : '' },
        ]),
      );
  }
  return ops;
}

describe('diffOperations', () => {
  it('turns any document into any other made from the same start', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const start = applyAll(undefined, randomEdits(seed, 12, 'base'));
      const ours = applyAll(start, randomEdits(seed * 7 + 1, 10, 'ours'));
      const theirs = applyAll(start, randomEdits(seed * 13 + 5, 10, 'theirs'));
      for (const [from, to] of [
        [ours, theirs],
        [theirs, ours],
        [start, ours],
        [ours, start],
      ] as const) {
        const ops = diffOperations(from, to);
        const reached = applyAll(from, ops);
        expect(sameDocument(reached, to), `seed ${seed}`).toBe(true);
        // Strict: every operation it returns applies, so none is silently dropped on replay.
        let doc = from;
        for (const op of ops) {
          const next = apply(doc, op);
          expect(next.ok, `seed ${seed}: ${JSON.stringify(op)}`).toBe(true);
          if (next.ok) doc = next.document;
        }
      }
    }
  });

  it('says nothing when there is nothing to do', () => {
    const doc = applyAll(undefined, randomEdits(3, 20, 'x'));
    expect(diffOperations(doc, doc)).toEqual([]);
  });

  it('changes only what differs', () => {
    const one = applyAll(undefined, [
      { op: 'addFeature', id: 'e', type: 'extrude', name: 'E', index: 0, params: { d: 1 } },
    ]);
    const two = applyAll(one, [{ op: 'updateParams', id: 'e', params: { d: 2 } }]);
    expect(diffOperations(one, two)).toEqual([{ op: 'updateParams', id: 'e', params: { d: 2 } }]);
  });
});
