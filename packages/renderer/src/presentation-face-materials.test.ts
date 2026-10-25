import { BufferGeometry } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { groupByMaterial } from './presentation-face-materials.js';

const names = ['F:a:top', 'F:a:side-1', 'F:a:side-2', null];
const keyOf = (face: number) => names[face] ?? null;

describe('drawing single faces in a material of their own', () => {
  it('groups the triangles of a face given one apart from the body’s', () => {
    const geometry = new BufferGeometry();
    // Two triangles of the top, three of one side, one of the other, one with no name.
    const faces = new Uint32Array([0, 0, 1, 1, 1, 2, 3]);
    const used = groupByMaterial(geometry, faces, keyOf, new Map([['F:a:side-1', 1]]));
    expect(used).toBe(1);
    expect(geometry.groups).toEqual([
      { start: 0, count: 6, materialIndex: 0 },
      { start: 6, count: 9, materialIndex: 1 },
      { start: 15, count: 6, materialIndex: 0 },
    ]);
  });

  it('leaves a body with no face of its own ungrouped, in its one material', () => {
    const geometry = new BufferGeometry();
    geometry.addGroup(0, 3, 1);
    const used = groupByMaterial(
      geometry,
      new Uint32Array([0, 1, 2]),
      keyOf,
      new Map([['F:b:top', 1]]),
    );
    expect(used).toBe(0);
    expect(geometry.groups).toEqual([]);
  });

  it('gives each face its own material', () => {
    const geometry = new BufferGeometry();
    const used = groupByMaterial(
      geometry,
      new Uint32Array([0, 1, 2]),
      keyOf,
      new Map([
        ['F:a:top', 2],
        ['F:a:side-2', 1],
      ]),
    );
    expect(used).toBe(2);
    expect(geometry.groups.map((g) => g.materialIndex)).toEqual([2, 0, 1]);
  });
});
