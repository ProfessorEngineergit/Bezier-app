import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { devServer } from './dev-server.js';
import { checkFolder } from './folder.js';
import { scaffold, TEMPLATES, type Template } from './templates.js';

function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'bezier-plugin-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

describe('bezier-plugin', () => {
  // A new author's first plugin must pass the store's review untouched, or the SDK teaches the
  // wrong thing on day one.
  for (const template of Object.keys(TEMPLATES) as Template[]) {
    it(`makes a ${template} plugin that review accepts`, async () => {
      const checked = await checkFolder(folder(scaffold('ada.first-plugin', template)));
      expect(checked.refused).toEqual([]);
      expect(checked.manifest?.name).toBe('First plugin');
      expect(checked.bytes).not.toBeNull();
    });
  }

  it('says what review would refuse, before anyone uploads it', async () => {
    const files = scaffold('ada.hidden', 'command');
    const hidden = folder({ ...files, 'main.js': `${files['main.js']}const a = "x​y";\n` });
    expect((await checkFolder(hidden)).refused[0]).toContain('invisible character');
    const evaluating = folder({ ...files, 'main.js': 'eval("1")' });
    expect((await checkFolder(evaluating)).refused[0]).toContain('eval');
    expect((await checkFolder(folder({}))).refused[0]).toContain('plugin.json');
  });

  it('serves the plugin to this machine only, and rings on a save', async () => {
    const dir = folder(scaffold('ada.live', 'command'));
    const server = devServer(dir);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const manifest = await fetch(`${base}/plugin.json`).then(
      (r) => r.json() as Promise<{ id: string }>,
    );
    expect(manifest.id).toBe('ada.live');
    expect(
      (await fetch(`${base}/main.js`, { headers: { Origin: 'https://example.org' } })).status,
    ).toBe(403);
    expect((await fetch(`${base}/../package.json`)).status).toBe(404);

    const events = await fetch(`${base}/events`);
    const reader = (events.body as ReadableStream<Uint8Array>).getReader();
    await reader.read(); // hello
    writeFileSync(join(dir, 'main.js'), `${readFileSync(join(dir, 'main.js'), 'utf8')}\n`);
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain('event: change');
    await reader.cancel();
    server.closeAllConnections();
    server.close();
  });
});
