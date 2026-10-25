import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keepBoth, mergeTrees } from './merge.ts';

const e = (name: string, document: string) => ({ name, document });

test('a project changed on one side only is taken from that side', () => {
  const base = { p: e('Bracket', 'v1'), q: e('Lid', 'l1') };
  const r = mergeTrees(base, { ...base, p: e('Bracket', 'v2') }, { ...base, q: e('Lid', 'l2') });
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(r.tree, { p: e('Bracket', 'v2'), q: e('Lid', 'l2') });
});

test('a rename on one side and an edit on the other both survive', () => {
  const base = { p: e('Bracket', 'v1') };
  const r = mergeTrees(base, { p: e('Bracket v2', 'v1') }, { p: e('Bracket', 'v2') });
  assert.deepEqual(r.tree, { p: e('Bracket v2', 'v2') });
});

test('both editing one project is a conflict, and keep-both loses neither', () => {
  const base = { p: e('Bracket', 'v1') };
  const r = mergeTrees(base, { p: e('Bracket', 'mine') }, { p: e('Bracket', 'yours') });
  assert.equal(r.conflicts.length, 1);
  assert.deepEqual(keepBoth(r, 'bob'), {
    p: e('Bracket', 'mine'),
    'p~bob': e('Bracket (bob)', 'yours'),
  });
});

test('deleting a project the other side edited is a conflict, not a silent loss', () => {
  const base = { p: e('Bracket', 'v1') };
  const r = mergeTrees(base, {}, { p: e('Bracket', 'v2') });
  assert.equal(r.conflicts.length, 1);
  assert.deepEqual(keepBoth(r, 'bob'), { p: e('Bracket', 'v2') });
});

test('deleting an untouched project deletes it, and new projects on both sides are kept', () => {
  const base = { p: e('Bracket', 'v1') };
  const r = mergeTrees(base, { a: e('A', 'a') }, { p: e('Bracket', 'v1'), b: e('B', 'b') });
  assert.deepEqual(r.tree, { a: e('A', 'a'), b: e('B', 'b') });
});
