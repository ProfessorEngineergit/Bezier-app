import { describe, expect, it } from 'vitest';
import { randomCode, serverFiles, serverZip } from './server-setup.js';

const text = (data: Uint8Array) => new TextDecoder().decode(data);

describe('server setup download', () => {
  it('makes a fresh enrollment code each time, long enough for the server to accept', () => {
    const a = randomCode();
    const b = randomCode();
    expect(a).not.toBe(b);
    // The server refuses codes under 16 characters (server/main.ts).
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(a).toMatch(/^[a-z2-9]+$/);
  });

  it('holds compose, Caddy, the settings and a short guide, all for the given name', () => {
    const { enrollment, files } = serverFiles('cad.example.org');
    const byName = new Map(files.map((f) => [f.name, text(f.data)]));
    expect([...byName.keys()].sort()).toEqual([
      'bezier-server/.env',
      'bezier-server/Caddyfile',
      'bezier-server/README.txt',
      'bezier-server/compose.yaml',
    ]);
    expect(byName.get('bezier-server/.env')).toContain(`BEZIER_SYNC_ENROLLMENT=${enrollment}`);
    expect(byName.get('bezier-server/.env')).toContain('BEZIER_DOMAIN=cad.example.org');
    expect(byName.get('bezier-server/compose.yaml')).toContain('.git#main:apps/sync-server');
    expect(byName.get('bezier-server/README.txt')).toContain('https://cad.example.org');
  });

  it('is a zip', () => {
    const { zip } = serverZip('cad.example.org');
    expect([...zip.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});
