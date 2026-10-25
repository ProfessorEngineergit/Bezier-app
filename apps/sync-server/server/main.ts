/**
 * The server's command line. Configured by environment variables so the same image runs
 * under Docker, systemd in a Proxmox container, or by hand.
 *
 *   node server/main.ts serve     run the server
 *   node server/main.ts scrub     check every copy of every object and repair what it can
 *   node server/main.ts mirror    catch up with another server (BEZIER_SYNC_MIRROR_FROM)
 *
 *   BEZIER_SYNC_DATA        primary directory                  (default ./data)
 *   BEZIER_SYNC_REPLICAS    more directories, separated by ':' (a second disk, a NAS mount)
 *   BEZIER_SYNC_HOST        address to listen on               (default 127.0.0.1)
 *   BEZIER_SYNC_PORT        port                               (default 8787)
 *   BEZIER_SYNC_ENROLLMENT  code that lets someone register without an invite
 *   BEZIER_SYNC_ORIGINS     origins Bezier may call from, separated by ','; any if unset
 *   BEZIER_SYNC_QUOTA_MB    space one vault may use, in megabytes  (default unlimited)
 *   BEZIER_SYNC_TRUST_PROXY 1 behind a proxy that sets X-Forwarded-For (the Caddy setup)
 *   BEZIER_SYNC_MIRROR_TOKEN on the first server: lets a mirror copy it (32+ characters).
 *                           on the mirror: the same token, to present
 *   BEZIER_SYNC_MIRROR_FROM on the mirror: the first server's address
 *   BEZIER_SYNC_MIRROR_EVERY on the mirror: catch up every this many seconds (default once)
 */

import { createSyncServer, VERSION } from './http.ts';
import { pullMirror } from './mirror.ts';
import { Store } from './store.ts';

const env = process.env;
const store = new Store(
  env.BEZIER_SYNC_DATA ?? './data',
  (env.BEZIER_SYNC_REPLICAS ?? '').split(':').filter((p) => p !== ''),
);
const command = process.argv[2] ?? 'serve';
// Empty counts as unset: that is how a compose .env file leaves a variable out.
const mirrorToken = env.BEZIER_SYNC_MIRROR_TOKEN || undefined;
if (mirrorToken !== undefined && mirrorToken.length < 32) {
  // The token opens a copy of every vault's ciphertext; it has to be unguessable.
  console.error('BEZIER_SYNC_MIRROR_TOKEN must be at least 32 characters.');
  process.exit(2);
}

if (command === 'scrub') {
  const report = await store.scrub();
  console.log(`checked ${report.checked} files`);
  for (const path of report.repaired) console.log(`repaired ${path}`);
  for (const path of report.lost) console.error(`LOST ${path} (no good copy on this server)`);
  process.exitCode = report.lost.length > 0 ? 1 : 0;
} else if (command === 'mirror') {
  const from = env.BEZIER_SYNC_MIRROR_FROM;
  if (from === undefined || mirrorToken === undefined) {
    console.error('Set BEZIER_SYNC_MIRROR_FROM and BEZIER_SYNC_MIRROR_TOKEN to mirror a server.');
    process.exit(2);
  }
  const every = Number(env.BEZIER_SYNC_MIRROR_EVERY ?? 0);
  const once = async () => {
    try {
      const r = await pullMirror(store, from, mirrorToken);
      console.log(
        `mirrored: ${r.objects} objects, ${r.refs} branch heads, ${r.vaults} vaults, ${r.users} users`,
      );
      for (const id of r.kept) console.log(`kept vault ${id}: it is gone from the first server`);
      for (const id of r.failed) console.error(`could not copy ${id}; trying again next time`);
      return r.failed.length === 0;
    } catch (error) {
      console.error(`mirror failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };
  if (every > 0) {
    // One run at a time: a slow catch-up is never overlapped by the next.
    for (;;) {
      await once();
      await new Promise((resolve) => setTimeout(resolve, every * 1000));
    }
  } else {
    process.exitCode = (await once()) ? 0 : 1;
  }
} else if (command === 'serve') {
  const host = env.BEZIER_SYNC_HOST ?? '127.0.0.1';
  const port = Number(env.BEZIER_SYNC_PORT ?? 8787);
  // Empty counts as unset: that is how a compose .env file leaves a variable out.
  const enrollmentCode = env.BEZIER_SYNC_ENROLLMENT || undefined;
  if (enrollmentCode !== undefined && enrollmentCode.length < 16) {
    // A short code on an internet-facing server is a door anyone can guess.
    console.error('BEZIER_SYNC_ENROLLMENT must be at least 16 characters.');
    process.exit(2);
  }
  const server = createSyncServer({
    store,
    ...(enrollmentCode === undefined ? {} : { enrollmentCode }),
    // Any origin unless narrowed: Bezier runs from the desktop app and from wherever someone
    // serves it, and every call carries its token in a header, never a cookie, so a page
    // elsewhere gains nothing by being allowed to call.
    allowedOrigins: (env.BEZIER_SYNC_ORIGINS || '*').split(',').filter((o) => o !== ''),
    ...(env.BEZIER_SYNC_QUOTA_MB === undefined || env.BEZIER_SYNC_QUOTA_MB === ''
      ? {}
      : { quotaBytes: Number(env.BEZIER_SYNC_QUOTA_MB) * 1024 * 1024 }),
    trustProxy: env.BEZIER_SYNC_TRUST_PROXY === '1',
    ...(mirrorToken === undefined ? {} : { mirrorToken }),
  });
  server.listen(port, host, () => {
    console.log(`bezier-sync ${VERSION} on http://${host}:${port}`);
    console.log(`storing in ${store.replicas.map((r) => r.path).join(', ')}`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
} else {
  console.error(`Unknown command "${command}". Use "serve", "scrub" or "mirror".`);
  process.exit(2);
}
