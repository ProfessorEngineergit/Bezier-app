/** Provenance and channel integrity cover the actual bundled asset library. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { MATERIALS } from './materials.js';

interface AssetRecord {
  provider: string;
  name: string;
  license: string;
  maps: Record<string, { file: string; sha256: string }>;
}
it('ships verified, local maps from all three providers without duplicate material names', () => {
  const root = new URL('../../public/materials/', import.meta.url);
  const catalog = JSON.parse(readFileSync(new URL('catalog.json', root), 'utf8')) as AssetRecord[];
  expect(new Set(catalog.map((asset) => asset.provider))).toEqual(
    new Set(['ambientCG', 'GPUOpen', 'Poly Haven']),
  );
  expect(new Set(MATERIALS.map((m) => m.name)).size).toBe(MATERIALS.length);
  for (const asset of catalog) {
    expect(['MIT', 'CC0-1.0']).toContain(asset.license);
    const material = MATERIALS.find((m) => m.name === asset.name);
    expect(material?.surface?.kind).toBe('texture');
    if (material?.surface?.kind !== 'texture') throw new Error(`${asset.name} is not connected`);
    expect(material.roughness).toBe(1);
    expect(material.surface.color).toBe(`/materials/${asset.maps.albedo?.file}`);
    for (const map of Object.values(asset.maps)) {
      const bytes = readFileSync(new URL(map.file, root));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(map.sha256);
    }
  }
});
