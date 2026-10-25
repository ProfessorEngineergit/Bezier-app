import { describe, expect, it } from 'vitest';
import type { PluginManifest } from '../format/manifest.js';
import { pluginDocument, themeCss, unsafeForInlineScript } from './sandbox.js';

const manifest: PluginManifest = {
  format: 'bezier-plugin',
  version: 1,
  id: 'ada.test',
  name: 'Test',
  description: '',
  pluginVersion: '1.0.0',
  api: 1,
  permissions: ['ui:panel'],
};

describe('plugin document', () => {
  it('allows only its own script, by hash, and no connections', async () => {
    const html = await pluginDocument(manifest, 'bezier.panel.show("Hi");', '');
    expect(html).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]{44}'/);
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toContain('unsafe-eval');
    expect(html).toContain("default-src 'none'");
  });

  it('opens connections only to the granted origins', async () => {
    const html = await pluginDocument(
      { ...manifest, permissions: ['network'], network: ['https://api.example.org'] },
      '',
      '',
    );
    expect(html).toContain('connect-src https://api.example.org;');
  });

  it('refuses code that would end the script early', async () => {
    expect(unsafeForInlineScript('const s = "</SCRIPT><meta>";')).toBe(true);
    expect(unsafeForInlineScript('a <!-- b')).toBe(true);
    await expect(pluginDocument(manifest, '"</script>"', '')).rejects.toThrow();
  });

  it('passes the theme through without letting a value escape its rule', () => {
    const css = themeCss({
      getPropertyValue: (name) => (name === '--text' ? 'red; } body { x' : ''),
    });
    expect(css).toContain('--text: red  body  x;');
  });
});
