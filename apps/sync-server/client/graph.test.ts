import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutGraph } from './graph.ts';

const c = (id: string, parents: string[], minute: number) => ({
  id,
  parents,
  at: `2026-10-07T10:${String(minute).padStart(2, '0')}:00Z`,
});

test('a straight history is one lane', () => {
  const g = layoutGraph([c('a', [], 1), c('b', ['a'], 2), c('c', ['b'], 3)]);
  assert.deepEqual(
    g.rows.map((r) => [r.commit.id, r.lane]),
    [
      ['c', 0],
      ['b', 0],
      ['a', 0],
    ],
  );
  assert.equal(g.width, 1);
  assert.deepEqual(g.rows[0]?.outgoing, [0]);
  assert.deepEqual(g.rows[2]?.outgoing, []);
});

test('a branch and its merge: two lanes that part and meet again', () => {
  //   m      merge of x into b
  //   | \
  //   b  x
  //   | /
  //   a
  const g = layoutGraph(
    [c('a', [], 1), c('b', ['a'], 2), c('x', ['a'], 3), c('m', ['b', 'x'], 4)],
    [
      { name: 'main', head: 'm' },
      { name: 'idea', head: 'x' },
    ],
  );
  const row = (id: string) => g.rows.find((r) => r.commit.id === id);
  assert.equal(g.width, 2);
  assert.deepEqual(row('m')?.outgoing, [0, 1]);
  assert.deepEqual(row('m')?.heads, ['main']);
  assert.deepEqual(row('x')?.heads, ['idea']);
  // Both lines lead to the common ancestor: one joins the other on the way, as in git's graph.
  const aLane = row('a')?.lane;
  assert.ok(row('b')?.outgoing.includes(aLane ?? -1));
  assert.ok(row('x')?.outgoing.includes(aLane ?? -1));
  // Each commit's own lane is one of the lanes that came to it.
  for (const r of g.rows) if (r.incoming.length > 0) assert.ok(r.incoming.includes(r.lane));
});

test('a branch nobody merged keeps its lane beside the main line', () => {
  const g = layoutGraph(
    [c('a', [], 1), c('b', ['a'], 2), c('x', ['a'], 3), c('y', ['x'], 5), c('c', ['b'], 4)],
    [
      { name: 'main', head: 'c' },
      { name: 'idea', head: 'y' },
    ],
  );
  const lanes = new Map(g.rows.map((r) => [r.commit.id, r.lane]));
  assert.equal(g.rows[0]?.commit.id, 'y');
  assert.notEqual(lanes.get('y'), lanes.get('c'));
  assert.equal(lanes.get('x'), lanes.get('y'));
  // While one lane is drawn the other passes through.
  const cRow = g.rows.find((r) => r.commit.id === 'c');
  assert.ok((cRow?.passing.length ?? 0) > 0);
});

test('a parent is never drawn above its child, whatever the clocks say', () => {
  // The child's clock is behind its parent's: a second machine with the wrong time.
  const g = layoutGraph([c('a', [], 9), c('b', ['a'], 1)]);
  assert.deepEqual(
    g.rows.map((r) => r.commit.id),
    ['b', 'a'],
  );
});

test('history cut off at a limit still lays out', () => {
  const g = layoutGraph([c('c', ['b'], 3), c('b', ['a'], 2)]);
  assert.deepEqual(
    g.rows.map((r) => r.commit.id),
    ['c', 'b'],
  );
  assert.deepEqual(g.rows[1]?.outgoing, []);
});
