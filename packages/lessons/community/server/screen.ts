/**
 * Hook for an external content scanner. LESSONS_SCREEN_CMD names an executable (e.g. a script
 * around ffmpeg and a classifier, or ClamAV) that receives the package path as its only argument;
 * a non-zero exit rejects the upload. Human review still follows.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function screenPackage(
  command: string | undefined,
  bytes: Uint8Array,
): Promise<boolean> {
  if (command === undefined) return true;
  const dir = await mkdtemp(join(tmpdir(), 'lessons-screen-'));
  try {
    const path = join(dir, 'upload.bezierlesson');
    await writeFile(path, bytes);
    return await new Promise<boolean>((resolve) => {
      execFile(command, [path], { timeout: 120_000 }, (error) => {
        if (error) console.warn('Screening rejected an upload.', error.message);
        resolve(error === null);
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
