/**
 * The docs server operator's tools, run on the server itself:
 *
 *   accounts                          who may write
 *   account-add <name> [author|reviewer] [perDay]   issue a token (shown once)
 *   account-revoke <id>
 *   history <id>                      every version of an article
 *   remove <id>                       take a live article down
 *   sweep                             delete pictures no article names any more
 *
 * Changes need no approval: each is published immediately, every version is kept, and anyone with
 * a token can restore an earlier one.
 */

import { readDocsConfig } from './config.js';
import { DocsStore } from './store.js';

const store = new DocsStore(readDocsConfig().dataDir);
const [command, first, second, third] = process.argv.slice(2);

switch (command) {
  case 'accounts':
    console.table(store.accounts());
    break;
  case 'account-add': {
    if (first === undefined) throw new Error('Give the account a name.');
    const role = second === 'reviewer' ? 'reviewer' : 'author';
    const { account, token } = store.createAccount(
      first,
      role,
      third === undefined ? 10 : Number(third),
    );
    console.log(`Account ${account.id} “${account.name}” (${role}). Token (shown once):\n${token}`);
    break;
  }
  case 'account-revoke':
    console.log(store.revokeAccount(Number(first)) ? 'Revoked.' : 'No such account.');
    break;
  case 'history':
    console.table(first === undefined ? [] : store.history(first));
    break;
  case 'remove':
    console.log(
      first !== undefined && store.remove(first) ? 'Taken down.' : 'No such live article.',
    );
    break;
  case 'sweep':
    console.log(`${await store.sweep()} pictures deleted.`);
    break;
  default:
    console.log('See the list at the top of cli.ts.');
}
store.close();
