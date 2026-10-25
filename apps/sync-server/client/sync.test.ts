/**
 * End-to-end against a real server and real files: invites, branches, races, merges,
 * rotation, protection, rollback, quota, and a final check that no stored byte is readable.
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fromUtf8, utf8 } from '../protocol/bytes.ts';
import { openObject, refId } from '../protocol/crypto.ts';
import { newIdentity } from '../protocol/identity.ts';
import { walkFiles } from '../server/disk.ts';
import { createSyncServer } from '../server/http.ts';
import { Store } from '../server/store.ts';
import { Connection, SyncError } from './connection.ts';
import { MemoryCache } from './memory-cache.ts';
import { type Commit, Repository } from './repository.ts';
import { VaultClient } from './vault-client.ts';

const ENROLLMENT = 'home-server-enrollment-code';
const SECRET_TEXT = 'Gehaeuse fuer Projekt Kranich';

let dir = '';
let url = '';
let server: ReturnType<typeof createSyncServer>;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bezier-sync-e2e-'));
  server = createSyncServer({
    store: new Store(join(dir, 'primary'), [join(dir, 'replica')]),
    enrollmentCode: ENROLLMENT,
    quotaBytes: 2 * 1024 * 1024,
    publicRateLimit: 10_000,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true });
});

async function person(register = true) {
  const conn = new Connection(url, await newIdentity());
  if (register) await conn.register({ enrollment: ENROLLMENT });
  return { conn, vaults: new VaultClient(conn) };
}

const project = (name: string, features: { id: string; depth?: number }[]) =>
  utf8(
    JSON.stringify({
      meta: {
        schemaVersion: 1,
        name,
        createdAt: '2026-01-01',
        modifiedAt: '2026-01-01',
        displayUnits: 'mm',
      },
      features: features.map((f) => ({
        id: f.id,
        type: 'extrude',
        name: f.id,
        params: { depth: f.depth ?? 10 },
      })),
    }),
  );

async function collect(gen: AsyncGenerator<Commit>): Promise<Commit[]> {
  const out: Commit[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

test('two people share a vault, branch, race, merge, and the server learns nothing', async () => {
  const alice = await person();
  const vault = await alice.vaults.create(SECRET_TEXT, 'Alice');
  const repoA = new Repository(alice.conn, vault, new MemoryCache());

  const model = project(SECRET_TEXT, [{ id: 'sketch-1' }, { id: 'extrude-1' }]);
  const doc1 = await repoA.putDocument(model);
  const first = await repoA.commit([], { p1: { name: SECRET_TEXT, document: doc1 } }, 'First');
  assert.deepEqual(await repoA.push('main', first, null), { ok: true, head: first });

  // Bob is not on the server; an invite link gets him in, as a writer.
  const { link } = await alice.vaults.invite(vault, 'writer');
  const bob = await person(false);
  const bobsVault = await bob.vaults.join(link, 'Bob');
  assert.equal(bobsVault.name, SECRET_TEXT);
  assert.equal(bobsVault.role, 'writer');
  // A link is good for one use.
  await assert.rejects((await person(false)).vaults.join(link), SyncError);
  // Names are visible to members, sealed for the server.
  const names = (await alice.vaults.get(vault.id)).members.map((m) => m.name).sort();
  assert.deepEqual(names, ['Alice', 'Bob']);

  // Bob sees Alice's commit and branch, both signed by her.
  const repoB = new Repository(bob.conn, bobsVault, new MemoryCache());
  const mainB = await repoB.branch('main');
  assert.equal(mainB?.verified, true);
  assert.equal(mainB?.author, alice.conn.identity.userId);
  const [firstB] = await collect(repoB.log(mainB?.head ?? ''));
  assert.equal(firstB?.verified, true);
  const doc = JSON.parse(fromUtf8(await repoB.getDocument(firstB?.tree.p1?.document ?? '')));
  assert.equal(doc.meta.name, SECRET_TEXT);

  // Both change the same project at once, in different features. Bob pushes first.
  const bobsModel = project(SECRET_TEXT, [
    { id: 'sketch-1' },
    { id: 'extrude-1' },
    { id: 'fillet-bob' },
  ]);
  const bobsDoc = await repoB.putDocument(bobsModel);
  const bobs = await repoB.commit(
    [first],
    { p1: { name: SECRET_TEXT, document: bobsDoc } },
    'Fillet',
  );
  assert.equal((await repoB.push('main', bobs, mainB)).ok, true);

  const alicesModel = project(SECRET_TEXT, [{ id: 'sketch-1' }, { id: 'extrude-1', depth: 25 }]);
  const alicesDoc = await repoA.putDocument(alicesModel);
  const alices = await repoA.commit(
    [first],
    { p1: { name: SECRET_TEXT, document: alicesDoc } },
    'Deeper',
  );
  const stale = await repoA.branch('main');
  assert.ok(stale !== null);
  // Alice's view is out of date by now; the server refuses instead of overwriting Bob.
  const raced = await repoA.push('main', alices, { ...stale, etag: 'f'.repeat(64) });
  assert.deepEqual(raced, { ok: false, remoteHead: bobs });

  // The merge goes inside the project: both features survive, no copy is needed.
  const merged = await repoA.merge(alices, bobs, { message: 'Merge Bob' });
  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.merged, ['p1']);
  const tree = (await repoA.readCommit(merged.head)).tree;
  const result = JSON.parse(fromUtf8(await repoA.getDocument(tree.p1?.document ?? '')));
  assert.deepEqual(
    result.features.map((f: { id: string; params: { depth: number } }) => [f.id, f.params.depth]),
    [
      ['sketch-1', 10],
      ['extrude-1', 25],
      ['fillet-bob', 10],
    ],
  );
  assert.equal((await repoA.push('main', merged.head, await repoA.branch('main'))).ok, true);

  // A branch for an experiment, invisible to the server by name.
  assert.equal((await repoA.push('experiment/ribs', merged.head, null)).ok, true);
  assert.deepEqual(
    (await repoB.branches()).map((b) => b.name),
    ['experiment/ribs', 'main'],
  );

  // A reader cannot move branches.
  const carol = await person();
  await alice.vaults.share(vault, carol.conn.identity.userId, 'reader');
  const [carolsVault] = await carol.vaults.list();
  assert.ok(carolsVault !== undefined);
  const repoC = new Repository(carol.conn, carolsVault, new MemoryCache());
  await assert.rejects(
    repoC.push('main', merged.head, await repoC.branch('main')),
    /needs writer access/,
  );

  // None of what the server stored contains a name, the model, a branch or a message.
  const secrets = [
    SECRET_TEXT,
    'extrude-1',
    'fillet-bob',
    'experiment/ribs',
    'Merge Bob',
    'Alice',
    'Bob',
  ];
  for (const root of ['primary', 'replica']) {
    for (const rel of await walkFiles(join(dir, root))) {
      const text = (await readFile(join(dir, root, rel))).toString('latin1');
      for (const secret of secrets) {
        assert.ok(!text.includes(secret), `${root}/${rel} contains "${secret}"`);
      }
    }
  }
});

test('conflicting edits of one feature are kept side by side, never lost', async () => {
  const alice = await person();
  const vault = await alice.vaults.create('conflicts');
  const repo = new Repository(alice.conn, vault, new MemoryCache());
  const put = async (depth: number) =>
    repo.putDocument(project('Part', [{ id: 'extrude-1', depth }]));
  const base = await repo.commit([], { p: { name: 'Part', document: await put(10) } }, 'base');
  const ours = await repo.commit([base], { p: { name: 'Part', document: await put(20) } }, 'ours');
  const theirs = await repo.commit([base], { p: { name: 'Part', document: await put(30) } }, 'b');

  const stopped = await repo.merge(ours, theirs, { onConflict: 'stop' });
  assert.equal(stopped.head, ours);
  assert.equal(stopped.conflicts.length, 1);

  const kept = await repo.merge(ours, theirs);
  const tree = (await repo.readCommit(kept.head)).tree;
  assert.equal(Object.keys(tree).length, 2);
  const depths = await Promise.all(
    Object.values(tree).map(
      async (e) =>
        JSON.parse(fromUtf8(await repo.getDocument(e.document))).features[0].params.depth,
    ),
  );
  assert.deepEqual(depths.sort(), [20, 30]);
});

test('removing a member rotates the key: what is written afterwards is sealed past them', async () => {
  const alice = await person();
  const bob = await person();
  let vault = await alice.vaults.create('rotation');
  await alice.vaults.share(vault, bob.conn.identity.userId, 'writer');
  const repoA = new Repository(alice.conn, vault, new MemoryCache());
  const first = await repoA.commit([], {}, 'before');
  await repoA.push('main', first, null);

  // Bob keeps his keyring as it was, the way a removed member keeps a copy.
  const [bobsOld] = await bob.vaults.list();
  assert.ok(bobsOld !== undefined);

  vault = await alice.vaults.removeMember(vault, bob.conn.identity.userId);
  assert.equal(vault.keyring.current.epoch, 1);
  assert.deepEqual(await bob.vaults.list(), []);

  const repoA2 = new Repository(alice.conn, vault, new MemoryCache());
  const doc = await repoA2.putDocument(utf8('after the rotation'));
  const second = await repoA2.commit([first], { p: { name: 'secret', document: doc } }, 'after');
  assert.equal((await repoA2.push('main', second, await repoA2.branch('main'))).ok, true);
  // Old history still opens under the new keyring.
  assert.equal((await collect(repoA2.log(second))).length, 2);

  // Even with the server's files, Bob's old keyring cannot open the new commit.
  const objectPath = join(dir, 'primary', 'vaults', vault.id, 'objects', second.slice(0, 2));
  const sealed = new Uint8Array(await readFile(join(objectPath, second)));
  await assert.rejects(openObject(bobsOld.keyring, second, sealed), /does not have/);

  // A share prepared before the rotation is refused rather than handing out an old keyring.
  const dave = await person();
  await assert.rejects(
    alice.vaults.share(bobsOld, dave.conn.identity.userId, 'reader'),
    /changed meanwhile/,
  );
});

test('a protected branch moves only for admins', async () => {
  const alice = await person();
  const bob = await person();
  const vault = await alice.vaults.create('protected');
  await alice.vaults.share(vault, bob.conn.identity.userId, 'writer');
  const repoA = new Repository(alice.conn, vault, new MemoryCache());
  const c1 = await repoA.commit([], {}, 'one');
  await repoA.push('main', c1, null);
  await alice.vaults.protect(vault, ['main']);
  assert.deepEqual((await alice.vaults.get(vault.id)).protected, [
    await refId(vault.keyring, 'main'),
  ]);

  const [bobsVault] = await bob.vaults.list();
  assert.ok(bobsVault !== undefined);
  const repoB = new Repository(bob.conn, bobsVault, new MemoryCache());
  const c2 = await repoB.commit([c1], {}, 'two');
  await assert.rejects(repoB.push('main', c2, await repoB.branch('main')), /protected/);
  assert.equal((await repoB.push('bob/two', c2, null)).ok, true);
  assert.equal((await repoA.merge(c1, c2)).head, c2);
  assert.equal((await repoA.push('main', c2, await repoA.branch('main'))).ok, true);
});

test('a server that replays an older branch head is noticed', async () => {
  const alice = await person();
  const vault = await alice.vaults.create('rollback');
  const repo = new Repository(alice.conn, vault, new MemoryCache());
  const c1 = await repo.commit([], {}, 'one');
  await repo.push('main', c1, null);
  const ref = await refId(vault.keyring, 'main');
  const refPath = join(dir, 'primary', 'vaults', vault.id, 'refs', ref);
  const old = await readFile(refPath);
  const c2 = await repo.commit([c1], {}, 'two');
  await repo.push('main', c2, await repo.branch('main'));
  assert.equal((await repo.branch('main'))?.rolledBack, false);

  await writeFile(refPath, old);
  const replayed = await repo.branch('main');
  assert.equal(replayed?.head, c1);
  assert.equal(replayed?.verified, true);
  assert.equal(replayed?.rolledBack, true);
});

test('invites can be withdrawn, and a vault can be renamed, left and deleted', async () => {
  const alice = await person();
  let vault = await alice.vaults.create('old name');
  const { link, id } = await alice.vaults.invite(vault, 'reader', { uses: 3 });
  assert.equal((await alice.vaults.get(vault.id)).invites.length, 1);
  await alice.vaults.withdrawInvite(vault, id);
  await assert.rejects((await person(false)).vaults.join(link), SyncError);

  vault = await alice.vaults.rename(vault, 'new name');
  assert.equal((await alice.vaults.list()).find((v) => v.id === vault.id)?.name, 'new name');

  const bob = await person();
  await alice.vaults.share(vault, bob.conn.identity.userId, 'reader');
  const [bobsVault] = await bob.vaults.list();
  assert.ok(bobsVault !== undefined);
  // The last admin cannot leave; a reader can.
  await assert.rejects(
    alice.vaults.removeMember(vault, alice.conn.identity.userId),
    /at least one admin/,
  );
  await bob.vaults.removeMember(bobsVault, bob.conn.identity.userId);
  assert.deepEqual(await bob.vaults.list(), []);

  await alice.vaults.remove(vault);
  assert.equal(
    (await alice.vaults.list()).some((v) => v.id === vault.id),
    false,
  );
});

test('a vault past its quota refuses new data with a sentence', async () => {
  const alice = await person();
  const vault = await alice.vaults.create('quota');
  const repo = new Repository(alice.conn, vault, new MemoryCache());
  const big = new Uint8Array(3 * 1024 * 1024).map((_, i) => (i * 7919) % 251);
  const doc = await repo.putDocument(big);
  const c = await repo.commit([], { p: { name: 'big', document: doc } }, 'big');
  await assert.rejects(repo.push('main', c, null), /vault is full/);
});

test('nobody joins without an invite or the enrollment code, and vaults stay invisible', async () => {
  const stranger = await person(false);
  await assert.rejects(stranger.conn.register({ enrollment: 'guess' }), /needs an invite/);
  await assert.rejects(stranger.conn.login(), /does not know you/);

  const alice = await person();
  const vault = await alice.vaults.create('private');
  const eve = await person();
  await assert.rejects(eve.conn.refs(vault.id), /No such vault/);
  await assert.rejects(eve.vaults.get(vault.id), /No such vault/);
  assert.deepEqual(await eve.vaults.list(), []);
});
