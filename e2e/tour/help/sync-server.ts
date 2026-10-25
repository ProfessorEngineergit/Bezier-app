/**
 * A real Bezier sync server on real files for the collaboration article's pictures, one per
 * worker, started before that worker's pictures and stopped after.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const ENROLLMENT = 'help-pictures-enrollment-code';

let child: ChildProcess | null = null;
let data = '';
export let serverUrl = '';

export async function startServer(worker: number): Promise<void> {
  const port = 18_960 + worker;
  data = mkdtempSync(join(tmpdir(), 'bezier-help-sync-'));
  child = spawn('node', ['apps/sync-server/server/main.ts', 'serve'], {
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      BEZIER_SYNC_DATA: data,
      BEZIER_SYNC_PORT: String(port),
      BEZIER_SYNC_ENROLLMENT: ENROLLMENT,
    },
    stdio: 'ignore',
  });
  serverUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    const ok = await fetch(`${serverUrl}/v1/health`)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('the sync server for the help pictures did not start');
}

export function stopServer(): void {
  child?.kill();
  child = null;
  if (data !== '') rmSync(data, { recursive: true, force: true });
}
