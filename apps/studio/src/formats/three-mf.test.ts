import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { modelXml, threeMf } from './three-mf.js';
import { crc32 } from './zip.js';

const triangle = {
  name: 'Body <1>',
  positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]),
  indices: new Uint32Array([0, 1, 2]),
};

describe('3MF', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes millimetres, one object per body, names escaped', () => {
    const xml = modelXml([triangle, { ...triangle, name: 'Body 2' }]);
    expect(xml).toContain('unit="millimeter"');
    expect(xml).toContain('name="Body &#60;1&#62;"');
    expect(xml.match(/<object /g)).toHaveLength(2);
    expect(xml.match(/<item /g)).toHaveLength(2);
    expect(xml).toContain('<triangle v1="0" v2="1" v3="2"/>');
  });

  it('is a zip that a real unzip reads back intact', () => {
    const dir = mkdtempSync(join(tmpdir(), '3mf-'));
    const file = join(dir, 'part.3mf');
    writeFileSync(file, threeMf([triangle]));
    // `unzip -t` checks every entry's CRC.
    const report = execFileSync('unzip', ['-t', file]).toString();
    expect(report).toContain('No errors detected');
    const model = execFileSync('unzip', ['-p', file, '3D/3dmodel.model']).toString();
    expect(model).toBe(modelXml([triangle]));
  });
});

describe('colours in 3MF', () => {
  const body = {
    name: 'Lid',
    positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0),
    indices: Uint32Array.of(0, 1, 2),
  };
  it('names a material for each coloured body and points the object at it', () => {
    const xml = modelXml([
      { ...body, colour: '#C0392B' },
      { ...body, name: 'Base' },
    ]);
    expect(xml).toContain('<basematerials id="3">');
    expect(xml).toContain('<base name="Lid" displaycolor="#C0392B"/>');
    expect(xml).toContain('<object id="1" name="Lid" type="model" pid="3" pindex="0">');
    expect(xml).toContain('<object id="2" name="Base" type="model">');
  });
  it('writes no materials when nothing has a colour', () => {
    expect(modelXml([body])).not.toContain('basematerials');
  });
});
