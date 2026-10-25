import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fromUtf8, utf8 } from '../protocol/bytes.ts';
import { newIdentity } from '../protocol/identity.ts';
import { createSyncServer } from '../server/http.ts';
import { Store } from '../server/store.ts';
import { Connection } from './connection.ts';
import { MemoryCache } from './memory-cache.ts';
import { Repository } from './repository.ts';
import { VaultClient } from './vault-client.ts';
import { fileNameFor, projectName, Workspace } from './workspace.ts';

let dir = '';
let url = '';
let server: ReturnType<typeof createSyncServer>;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bezier-sync-ws-'));
  server = createSyncServer({ store: new Store(dir), enrollmentCode: 'enroll-enroll-enroll' });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true });
});

async function twoDevices() {
  const conn = new Connection(url, await newIdentity());
  await conn.register({ enrollment: 'enroll-enroll-enroll' });
  const vault = await new VaultClient(conn).create('ws');
  const a = new Workspace(new Repository(conn, vault, new MemoryCache()), 'main');
  const b = new Workspace(new Repository(conn, vault, new MemoryCache()), 'main');
  return { a, b };
}

test('adding, renaming, replacing and deleting projects are commits on the branch', async () => {
  const { a } = await twoDevices();
  const { id } = await a.addProject('Bracket', utf8('v1'));
  await a.renameProject(id, 'Bracket L');
  await a.replaceProject(id, utf8('v2'));
  const state = await a.state();
  assert.equal(state.tree[id]?.name, 'Bracket L');
  assert.equal(fromUtf8(await a.repo.getDocument(state.tree[id]?.document ?? '')), 'v2');
  const log = [];
  for await (const c of a.repo.log(state.branch?.head ?? '')) log.push(c.message);
  assert.deepEqual(log, ['Update project', 'Rename to Bracket L', 'Add Bracket']);
  await a.removeProject(id);
  assert.deepEqual((await a.state()).tree, {});
});

test('two devices changing the branch at once both land, merged without asking', async () => {
  const { a, b } = await twoDevices();
  await a.addProject('First', utf8('1'));
  // Device b reads the branch, then device a moves it before b pushes.
  const original = b.repo.branch.bind(b.repo);
  let calls = 0;
  b.repo.branch = async (name: string) => {
    const result = await original(name);
    if (calls++ === 0) await a.addProject('From A', utf8('a'));
    return result;
  };
  const result = await b.addProject('From B', utf8('b'));
  b.repo.branch = original;
  assert.notEqual(result.result.mergedWith, null);
  const names = Object.values((await a.state()).tree)
    .map((e) => e.name)
    .sort();
  assert.deepEqual(names, ['First', 'From A', 'From B']);
});

test('restoring an older version and merging a branch back', async () => {
  const { a } = await twoDevices();
  const { id } = await a.addProject('Part', utf8('old'));
  const oldCommit = (await a.state()).commit;
  await a.replaceProject(id, utf8('new'));
  assert.ok(oldCommit !== null);
  const oldEntry = oldCommit.tree[id];
  assert.ok(oldEntry !== undefined);
  await a.restoreProject(id, oldEntry, oldCommit);
  const restored = (await a.state()).tree[id]?.document ?? '';
  assert.equal(fromUtf8(await a.repo.getDocument(restored)), 'old');

  await a.branchOff('idea');
  const idea = new Workspace(a.repo, 'idea');
  await idea.addProject('Idea', utf8('i'));
  await assert.rejects(a.branchOff('idea'), /exists already/);
  const merged = await a.mergeFrom('idea');
  assert.equal(merged.mergedWith !== null, true);
  const names = Object.values((await a.state()).tree)
    .map((e) => e.name)
    .sort();
  assert.deepEqual(names, ['Idea', 'Part']);
  // Merging again changes nothing.
  assert.equal((await a.mergeFrom('idea')).mergedWith, null);
});

test('names come from inside a project, and file names are safe', () => {
  const doc = utf8(JSON.stringify({ meta: { name: 'Gehäuse' }, features: [] }));
  assert.equal(projectName('x.bezier.json', doc), 'Gehäuse');
  assert.equal(projectName('lid.bezier.json', utf8('not json')), 'lid');
  assert.equal(projectName('scan.stl', new Uint8Array([1, 2])), 'scan');
  assert.equal(fileNameFor('a/b: c?'), 'a b c.bezier.json');
  assert.equal(fileNameFor(''), 'project.bezier.json');
});
