/**
 * The plugin server operator's tools, run on the server itself:
 *
 *   authors                          who may upload
 *   author-add <name> [perDay]       issue an upload token (shown once)
 *   author-revoke <id>
 *   pending                          versions waiting for review, with findings
 *   review <versionId>               manifest, permissions, findings, and where main.js is
 *   approve <versionId>
 *   reject <versionId> <reason…>     deletes the package
 *   revoke <versionId> <reason…>     takes an approved version back; installed copies switch off
 */

import { unzipSync } from 'fflate';
import { readPluginConfig } from './config.js';
import { PluginStore } from './store.js';

const store = new PluginStore(readPluginConfig().dataDir);
const [command, first, ...rest] = process.argv.slice(2);
const reason = rest.join(' ');

async function decide(status: 'approved' | 'rejected' | 'revoked') {
  const done = first !== undefined && (await store.setStatus(first, status, reason));
  console.log(done ? `${first}: ${status}` : 'No such version.');
}

switch (command) {
  case 'authors':
    console.table(store.authors());
    break;
  case 'author-add': {
    if (first === undefined) throw new Error('Give the author a name.');
    const { author, token } = store.createAuthor(
      first,
      rest[0] === undefined ? 5 : Number(rest[0]),
    );
    console.log(`Author ${author.id} “${author.name}”. Token (shown once):\n${token}`);
    break;
  }
  case 'author-revoke':
    console.log(store.revokeAuthor(Number(first)) ? 'Revoked.' : 'No such author.');
    break;
  case 'pending':
    console.table(
      store.byStatus('pending').map((v) => ({
        version: v.version_id,
        plugin: `${v.plugin}@${v.version}`,
        author: v.author,
        permissions: v.permissions,
        findings: v.findings,
        note: v.note,
      })),
    );
    break;
  case 'review': {
    const v = first === undefined ? null : store.version(first);
    if (v === null) {
      console.log('No such version.');
      break;
    }
    console.log(`${v.plugin}@${v.version} by ${v.author} — ${v.status}`);
    console.log(`Permissions: ${v.permissions}  Network: ${v.network}`);
    console.log(`Findings: ${v.findings}`);
    console.log(`Reports: ${store.reports(String(v.plugin)).length}`);
    // Print the full source; approving code requires reading it.
    const files = unzipSync(await store.readPackage(String(v.sha256)));
    console.log('\n---- main.js ----\n');
    console.log(new TextDecoder().decode(files['main.js']));
    break;
  }
  case 'approve':
    await decide('approved');
    break;
  case 'reject':
    await decide('rejected');
    break;
  case 'revoke':
    await decide('revoked');
    break;
  default:
    console.log(
      'Commands: authors, author-add, author-revoke, pending, review, approve, reject, revoke',
    );
}
store.close();
