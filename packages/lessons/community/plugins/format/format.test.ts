import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { compareVersions, manifestProblem, type PluginManifest } from './manifest.js';
import { readPluginPackage, writePluginPackage } from './package.js';

const manifest: PluginManifest = {
  format: 'bezier-plugin',
  version: 1,
  id: 'ada.model-stats',
  name: 'Model statistics',
  description: 'Counts what is in the model.',
  pluginVersion: '1.0.0',
  api: 1,
  permissions: ['project:read', 'ui:panel'],
};

describe('plugin manifest', () => {
  it('accepts a good one', () => {
    expect(manifestProblem(manifest)).toBeNull();
  });

  it('refuses unknown permissions and odd ids', () => {
    expect(manifestProblem({ ...manifest, permissions: ['dom'] })).toContain('permission');
    expect(manifestProblem({ ...manifest, permissions: ['ui:panel', 'ui:panel'] })).toContain(
      'permission',
    );
    expect(manifestProblem({ ...manifest, id: '../x' })).toContain('id');
    expect(manifestProblem({ ...manifest, id: 'Ada.Stats' })).toContain('id');
    expect(manifestProblem({ ...manifest, permissions: ['__proto__'] })).toContain('permission');
  });

  it('ties network to a list of https origins', () => {
    const net = { ...manifest, permissions: ['network'] };
    expect(manifestProblem(net)).toContain('origins');
    expect(manifestProblem({ ...net, network: ['https://api.example.org'] })).toBeNull();
    expect(manifestProblem({ ...net, network: ['http://api.example.org'] })).toContain('https');
    expect(manifestProblem({ ...net, network: ['https://api.example.org/path'] })).toContain(
      'https',
    );
    expect(manifestProblem({ ...net, network: ['https://*.example.org'] })).toContain('https');
    expect(manifestProblem({ ...manifest, network: ['https://api.example.org'] })).toContain(
      'network',
    );
  });

  it('orders versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.9.0', '1.0.0')).toBeLessThan(0);
  });
});

describe('plugin package', () => {
  it('round-trips', async () => {
    const bytes = await writePluginPackage({ manifest, code: 'bezier.ready();', readme: '# Hi' });
    const read = await readPluginPackage(bytes);
    expect(read.manifest.id).toBe('ada.model-stats');
    expect(read.code).toBe('bezier.ready();');
    expect(read.readme).toBe('# Hi');
  });

  it('refuses compression, missing code and broken text', async () => {
    const files = { 'plugin.json': strToU8(JSON.stringify(manifest)), 'main.js': strToU8('x') };
    await expect(readPluginPackage(zipSync(files, { level: 9 }))).rejects.toThrow(
      'without compression',
    );
    await expect(
      readPluginPackage(zipSync({ 'plugin.json': files['plugin.json'] }, { level: 0 })),
    ).rejects.toThrow('no plugin');
    const broken = zipSync({ ...files, 'main.js': new Uint8Array([0xff, 0xfe]) }, { level: 0 });
    await expect(readPluginPackage(broken)).rejects.toThrow('UTF-8');
    await expect(readPluginPackage(strToU8('nope'))).rejects.toThrow('not a .bezierplugin');
  });
});
