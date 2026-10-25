import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { LIMITS } from '../client/limits.js';
import { inspectUpload, Rejected } from './inspect.js';

const ID = 'a'.repeat(32);
const sample = new Uint8Array(readFileSync('packages/lessons/samples/box-extrude.bezierlesson'));

/** The sample with its manifest changed. */
function withManifest(change: (m: Record<string, unknown>) => void): Uint8Array {
  const files = unzipSync(sample);
  const manifest = JSON.parse(strFromU8(files['manifest.json'] ?? new Uint8Array()));
  change(manifest);
  return zipSync({ ...files, 'manifest.json': strToU8(JSON.stringify(manifest)) }, { level: 0 });
}

async function reason(bytes: Uint8Array, blocklist: string[] = []): Promise<string> {
  try {
    await inspectUpload(bytes, ID, blocklist);
  } catch (error) {
    if (error instanceof Rejected) return error.message;
    throw error;
  }
  return 'accepted';
}

describe('inspectUpload', () => {
  it('accepts the sample and rebuilds it under the server’s id', async () => {
    const { manifest, bytes } = await inspectUpload(sample, ID, []);
    expect(manifest.id).toBe(ID);
    expect(Object.keys(unzipSync(bytes)).sort()).toEqual(['manifest.json', 'viewport.mp4']);
  });

  it('drops entries that are not part of the format', async () => {
    const files = unzipSync(sample);
    const padded = zipSync({ ...files, 'evil.exe': strToU8('MZ') }, { level: 0 });
    const { bytes } = await inspectUpload(padded, ID, []);
    expect(Object.keys(unzipSync(bytes))).not.toContain('evil.exe');
  });

  it('refuses what is not a package', async () => {
    expect(await reason(strToU8('not a zip at all'))).toContain('not a .bezierlesson');
  });

  it('refuses a compressed package, which could hide a zip bomb', async () => {
    const files = unzipSync(sample);
    const compressed = zipSync(files, { level: 9 });
    expect(await reason(compressed)).toContain('compressed');
  });

  it('refuses a recording that is not the video it claims', async () => {
    const files = unzipSync(sample);
    const fake = zipSync(
      { ...files, 'viewport.mp4': strToU8('<html>surprise</html>') },
      { level: 0 },
    );
    expect(await reason(fake)).toContain('not a valid video/mp4');
  });

  it('refuses lessons that run too long', async () => {
    const long = withManifest((m) => {
      m.duration = LIMITS.durationSeconds + 1;
    });
    expect(await reason(long)).toContain('minutes');
  });

  it('refuses a title on the blocklist and a link in the description', async () => {
    const titled = withManifest((m) => {
      m.title = 'Badword tutorial';
    });
    expect(await reason(titled, ['badword'])).toContain('title');
    const linked = withManifest((m) => {
      m.description = 'More at https://example.org';
    });
    expect(await reason(linked)).toContain('description');
  });

  it('refuses a checkpoint that is not a model', async () => {
    const bad = withManifest((m) => {
      (m.states as { project: string }[])[0] = {
        ...(m.states as object[])[0],
        project: '"text"',
      } as never;
    });
    expect(await reason(bad)).toContain('does not hold a Bezier model');
  });
});
