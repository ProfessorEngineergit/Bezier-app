/**
 * The operator's tools, run on the server itself:
 *
 *   accounts                        list who may upload
 *   account-add <name> [perDay]     issue an upload token (shown once)
 *   account-revoke <id>
 *   pending                         lessons waiting for a decision
 *   review <id>                     print the package path for review
 *   approve <id>
 *   reject <id> <reason…>           deletes the package
 *   remove <id> <reason…>           takes an approved lesson down
 */

import { readConfig } from './config.js';
import { Store } from './store.js';

const store = new Store(readConfig().dataDir);
const [command, first, ...rest] = process.argv.slice(2);
const reason = rest.join(' ');

async function decide(status: 'approved' | 'rejected' | 'removed') {
  const done = first !== undefined && (await store.setStatus(first, status, reason));
  console.log(done ? `${first}: ${status}` : 'No such lesson.');
}

switch (command) {
  case 'accounts':
    console.table(store.accounts());
    break;
  case 'account-add': {
    if (first === undefined) throw new Error('Give the account a name.');
    const { account, token } = store.createAccount(
      first,
      rest[0] === undefined ? 5 : Number(rest[0]),
    );
    console.log(`Account ${account.id} “${account.name}”. Token (shown once):\n${token}`);
    break;
  }
  case 'account-revoke':
    console.log(store.revokeAccount(Number(first)) ? 'Revoked.' : 'No such account.');
    break;
  case 'pending':
    console.table(
      store.byStatus('pending').map((l) => ({
        id: l.id,
        title: l.title,
        author: l.author,
        min: Math.round(l.duration / 60),
        note: l.note,
        reports: store.reports(l.id).length,
      })),
    );
    break;
  case 'review': {
    const lesson = first === undefined ? null : store.get(first);
    console.log(
      lesson
        ? `${store.path(lesson.sha256)}\n${lesson.title}\n${lesson.description}`
        : 'No such lesson.',
    );
    break;
  }
  case 'approve':
    await decide('approved');
    break;
  case 'reject':
    await decide('rejected');
    break;
  case 'remove':
    await decide('removed');
    break;
  default:
    console.log(
      'Commands: accounts, account-add, account-revoke, pending, review, approve, reject, remove',
    );
}
store.close();
