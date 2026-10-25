import { createEmptyDocument } from '@bezier/core';
import { expect, it } from 'vitest';
import { joinStl, referenceTriangles, trianglesStl } from './mesh-stl.js';

const count = (stl: Uint8Array) => new DataView(stl.buffer, stl.byteOffset).getUint32(80, true);

it('writes an imported mesh back out as STL, joined to the solids (audit F-005)', () => {
  const floats = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1]);
  const bytes = new Uint8Array(floats.buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const document = {
    ...createEmptyDocument('Mesh'),
    features: [
      { id: 'mesh-1', type: 'reference-mesh', name: 'Scan', params: { mesh: btoa(binary) } },
    ],
  };
  const meshes = referenceTriangles(document);
  expect(meshes.map((m) => m.length)).toEqual([18]);
  const loose = trianglesStl(meshes);
  expect(count(loose)).toBe(2);
  expect(new DataView(loose.buffer).getFloat32(84 + 12 + 12, true)).toBe(1);
  const joined = joinStl([loose, loose]);
  expect(count(joined)).toBe(4);
  expect(joined.length).toBe(84 + 4 * 50);
});
