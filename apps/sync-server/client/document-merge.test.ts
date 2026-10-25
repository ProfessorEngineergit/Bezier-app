import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asDocument, type DocumentLike, mergeDocuments } from './document-merge.ts';

const meta = (name: string, modifiedAt = '2026-01-01T00:00:00Z') => ({
  schemaVersion: 1,
  name,
  createdAt: '2026-01-01T00:00:00Z',
  modifiedAt,
  displayUnits: 'mm',
});
const f = (id: string, depth = 10) => ({ id, type: 'extrude', name: id, params: { depth } });
const doc = (features: ReturnType<typeof f>[], m = meta('Bracket')): DocumentLike => ({
  meta: m,
  features,
});

const ids = (d: DocumentLike) => d.features.map((x) => x.id);

test('features added on both sides are both kept, each after what preceded it', () => {
  const base = doc([f('sketch-1'), f('extrude-1')]);
  const ours = doc([f('sketch-1'), f('extrude-1'), f('fillet-a')]);
  const theirs = doc([f('sketch-1'), f('hole-b'), f('extrude-1')]);
  const r = mergeDocuments(base, ours, theirs);
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(ids(r.document), ['sketch-1', 'hole-b', 'extrude-1', 'fillet-a']);
});

test('an edit on one side and a new feature on the other both survive', () => {
  const base = doc([f('sketch-1'), f('extrude-1', 10)]);
  const ours = doc([f('sketch-1'), f('extrude-1', 25)]);
  const theirs = doc([f('sketch-1'), f('extrude-1', 10), f('fillet-b')]);
  const r = mergeDocuments(base, ours, theirs);
  assert.deepEqual(r.conflicts, []);
  assert.equal(
    r.document.features[1]?.params && (r.document.features[1].params as { depth: number }).depth,
    25,
  );
  assert.deepEqual(ids(r.document), ['sketch-1', 'extrude-1', 'fillet-b']);
});

test('the same part of a feature changed differently on both sides is a conflict', () => {
  const base = doc([f('extrude-1', 10)]);
  const r = mergeDocuments(base, doc([f('extrude-1', 20)]), doc([f('extrude-1', 30)]));
  assert.deepEqual(r.conflicts, [{ path: 'feature:extrude-1.params', reason: 'both-changed' }]);
});

test('one renaming a feature and the other resizing it keeps both', () => {
  const base = doc([f('extrude-1', 10)]);
  const renamed = { ...f('extrude-1', 10), name: 'Body' };
  const r = mergeDocuments(base, doc([renamed]), doc([f('extrude-1', 30)]));
  assert.deepEqual(r.conflicts, []);
  assert.equal(r.document.features[0]?.name, 'Body');
  assert.equal((r.document.features[0]?.params as { depth: number } | undefined)?.depth, 30);
});

test('deleting a feature the other side edited is a conflict, not a silent loss', () => {
  const base = doc([f('sketch-1'), f('extrude-1', 10)]);
  const r = mergeDocuments(base, doc([f('sketch-1')]), doc([f('sketch-1'), f('extrude-1', 40)]));
  assert.deepEqual(r.conflicts, [{ path: 'feature:extrude-1', reason: 'changed-and-deleted' }]);
  assert.deepEqual(ids(r.document), ['sketch-1', 'extrude-1']);
});

test('deleting an untouched feature deletes it', () => {
  const base = doc([f('sketch-1'), f('extrude-1')]);
  const r = mergeDocuments(base, doc([f('sketch-1')]), base);
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(ids(r.document), ['sketch-1']);
});

test('a rename on one side and a unit change on the other merge; modifiedAt takes the later', () => {
  const base = doc([f('s')], meta('Bracket'));
  const ours = doc([f('s')], { ...meta('Bracket v2', '2026-02-01T00:00:00Z') });
  const theirs = doc([f('s')], { ...meta('Bracket', '2026-03-01T00:00:00Z'), displayUnits: 'in' });
  const r = mergeDocuments(base, ours, theirs);
  assert.deepEqual(r.conflicts, []);
  assert.equal(r.document.meta.name, 'Bracket v2');
  assert.equal(r.document.meta.displayUnits, 'in');
  assert.equal(r.document.meta.modifiedAt, '2026-03-01T00:00:00Z');
});

test('a reorder on one side is kept while the other side adds', () => {
  const base = doc([f('a'), f('b'), f('c')]);
  const ours = doc([f('a'), f('b'), f('c'), f('d')]);
  const theirs = doc([f('b'), f('a'), f('c')]);
  assert.deepEqual(ids(mergeDocuments(base, ours, theirs).document), ['b', 'a', 'c', 'd']);
});

test('key order does not make equal features look different', () => {
  const base = doc([{ id: 'x', type: 't', name: 'x', params: { a: 1, b: 2 } } as never]);
  const ours = doc([{ params: { b: 2, a: 1 }, name: 'x', type: 't', id: 'x' } as never]);
  const theirs = doc([{ id: 'x', type: 't', name: 'x', params: { a: 1, b: 3 } } as never]);
  const r = mergeDocuments(base, ours, theirs);
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(r.document.features[0]?.params, { a: 1, b: 3 });
});

test('only documents with a meta object and uniquely identified features are merged', () => {
  assert.equal(asDocument({ meta: {}, features: [{ id: 'a' }] }) !== null, true);
  assert.equal(asDocument({ features: [] }), null);
  assert.equal(asDocument({ meta: {}, features: [{ id: 'a' }, { id: 'a' }] }), null);
  assert.equal(asDocument('text'), null);
});
