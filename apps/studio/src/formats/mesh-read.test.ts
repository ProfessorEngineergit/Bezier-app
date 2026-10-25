import { describe, expect, it } from 'vitest';
import { decodeMesh, encodeMesh, readMesh } from './mesh-read.js';

const encode = (text: string) => new TextEncoder().encode(text);

describe('reading meshes', () => {
  it('reads text STL', () => {
    const result = readMesh(
      'a.stl',
      encode(
        'solid a\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid a\n',
      ),
    );
    expect(result.ok && [...result.positions]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });

  it('reads binary STL, trailing bytes and all', () => {
    const bytes = new Uint8Array(84 + 50 + 4);
    const view = new DataView(bytes.buffer);
    bytes.set(encode('solid but binary'), 0);
    view.setUint32(80, 1, true);
    [0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 2, 0].forEach((v, i) => {
      view.setFloat32(84 + i * 4, v, true);
    });
    const result = readMesh('b.stl', bytes);
    expect(result.ok && [...result.positions]).toEqual([0, 0, 0, 2, 0, 0, 0, 2, 0]);
  });

  it('reads OBJ quads as two triangles, with slashes and negative indices', () => {
    const result = readMesh(
      'q.obj',
      encode('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1/1/1 2/2/2 3/3/3 -1\n'),
    );
    expect(result.ok && result.positions.length).toBe(18);
  });

  it('says what is wrong with a broken file', () => {
    expect(readMesh('x.obj', encode('v 0 0 0\nf 1 2 3\n'))).toEqual({
      ok: false,
      message: 'This OBJ file refers to a point it does not have.',
    });
    expect(readMesh('e.obj', encode('# nothing\n')).ok).toBe(false);
  });

  it('round-trips through the document text exactly', () => {
    const positions = new Float32Array([0.1, -2.5, 3e5, 1, 2, 3, 4, 5, 6]);
    expect([...decodeMesh(encodeMesh(positions))]).toEqual([...positions]);
  });
});
