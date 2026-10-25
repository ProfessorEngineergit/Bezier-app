import { faceRef, formatRef, type StableRef } from '@bezier/core';
import type { Mesh } from '@bezier/kernel';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { indexFaceVertices } from './mesh.js';
import { Picker } from './picking.js';

/**
 * A 10 mm cube whose six faces are numbered, so a pick has a right answer. Face 0 bottom (z=0), 1
 * top (z=10), 2 front (y=0), 3 right (x=10), 4 back (y=10), 5 left (x=0).
 */
function cube(): Mesh {
  return {
    positions: new Float32Array([
      0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10,
    ]),
    normals: new Float32Array(24),
    indices: new Uint32Array([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 0,
      4, 7, 0, 7, 3,
    ]),
    triangleFaces: new Uint32Array([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]),
  };
}

const refs: readonly StableRef[] = [
  faceRef('extrude-1', 'start'),
  faceRef('extrude-1', 'end'),
  faceRef('extrude-1', 'side-0'),
  faceRef('extrude-1', 'side-1'),
  faceRef('extrude-1', 'side-2'),
  faceRef('extrude-1', 'side-3'),
];

/** A camera looking down at the cube from directly above. */
function overheadCamera(): PerspectiveCamera {
  return cameraAt(5, 5, 120);
}

/**
 * A three-quarter view, the way a CAD viewport sits. These tests exercise shared seams;
 * silhouette rims in a face-on view are covered against the real kernel in picking-round.test.ts.
 */
function angledCamera(): PerspectiveCamera {
  return cameraAt(60, -60, 60);
}

function cameraAt(x: number, y: number, z: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(x, y, z);
  camera.lookAt(5, 5, 5);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

/** Where a world point lands in normalised device coordinates. */
function ndcOf(camera: PerspectiveCamera, x: number, y: number, z: number): [number, number] {
  const point = new Vector3(x, y, z).project(camera);
  return [point.x, point.y];
}

describe('Picker', () => {
  it('occludes annotations behind the solid but keeps surface and outside points visible', () => {
    const picker = new Picker();
    picker.setGeometry(cube(), refs);
    const above = overheadCamera();
    expect(picker.pointVisible(above, 5, 5, 10)).toBe(true);
    expect(picker.pointVisible(above, 5, 5, 0)).toBe(false);
    expect(picker.pointVisible(above, 5, 5, 5)).toBe(false);
    expect(picker.pointVisible(above, 20, 5, 0)).toBe(true);
    const below = cameraAt(5, 5, -100);
    expect(picker.pointVisible(below, 5, 5, 0)).toBe(true);
    expect(picker.pointVisible(below, 5, 5, 10)).toBe(false);
    picker.setSection(5);
    expect(picker.pointVisible(above, 5, 5, 10)).toBe(false);
    expect(picker.pointVisible(above, 5, 5, 0)).toBe(true);
  });
  it('picks through clipped faces and restores them when sectioning ends', () => {
    const picker = new Picker();
    picker.setGeometry(cube(), refs);
    const camera = overheadCamera();
    picker.setSection(5);
    const hit = picker.pick(camera, 0, 0, 0.005, 'face');
    expect(hit?.point.z).toBeCloseTo(0);
    expect(hit?.distance).toBeCloseTo(120);
    picker.setSection(-1);
    expect(picker.pick(camera, 0, 0, 0.005, 'face')).toBeNull();
    picker.setSection(null);
    expect(picker.pick(camera, 0, 0, 0.005, 'face')?.point.z).toBeCloseTo(10);
  });

  it('reports nothing before it has geometry', () => {
    const picker = new Picker();
    expect(picker.ready).toBe(false);
    expect(picker.pick(overheadCamera(), 0, 0, 0.01)).toBeNull();
  });

  it('resolves a click on a face to that face’s stable reference', () => {
    const picker = new Picker();
    picker.setGeometry(cube(), refs);
    const camera = overheadCamera();

    // Straight down at the middle of the top face.
    const [x, y] = ndcOf(camera, 5, 5, 10);
    const hit = picker.pick(camera, x, y, 0.005, 'face');

    expect(hit).not.toBeNull();
    expect(formatRef(hit?.ref as StableRef)).toBe('F:extrude-1:end');
    expect(hit?.point.z).toBeCloseTo(10, 3);
  });

  it('returns null when nothing is under the cursor', () => {
    const picker = new Picker();
    picker.setGeometry(cube(), refs);
    const camera = overheadCamera();

    // Far outside the cube, still on screen.
    const [x, y] = ndcOf(camera, 400, 400, 0);
    expect(picker.pick(camera, x, y, 0.005)).toBeNull();
  });

  it('names an edge by the two faces that meet at it', () => {
    const picker = new Picker();
    picker.setGeometry(cube(), refs);
    const camera = angledCamera();

    // Sitting on the seam between the top face and the x = 10 side.
    const [x, y] = ndcOf(camera, 10, 5, 10);
    const hit = picker.pick(camera, x, y, 0.02, 'any');

    expect(hit).not.toBeNull();
    expect(formatRef(hit?.ref as StableRef)).toBe('E(F:extrude-1:end|F:extrude-1:side-1)');
  });

  it('names a corner by the three faces that meet at it', () => {
    const picker = new Picker();
    picker.setGeometry(cube(), refs);
    const camera = angledCamera();

    // The corner of the top, the front (y = 0) and the x = 10 side.
    const [x, y] = ndcOf(camera, 10, 0, 10);
    const hit = picker.pick(camera, x, y, 0.02, 'any');

    expect(hit?.ref.kind).toBe('vertex');
    expect(hit?.ref.kind === 'vertex' && hit.ref.faces.map((face) => face.tag)).toEqual([
      'end',
      'side-0',
      'side-1',
    ]);
    expect(hit?.point).toEqual({ x: 10, y: 0, z: 10 });
    // Asked for a corner only, the same point gives the same answer; along an edge, none.
    expect(picker.pick(camera, x, y, 0.02, 'vertex')?.ref.kind).toBe('vertex');
    const [ex, ey] = ndcOf(camera, 10, 5, 10);
    expect(picker.pick(camera, ex, ey, 0.02, 'vertex')).toBeNull();
  });

  it('gives back a face, not an edge, well away from any seam', () => {
    const picker = new Picker();
    picker.setGeometry(cube(), refs);
    const camera = overheadCamera();

    const [x, y] = ndcOf(camera, 5, 5, 10);
    const hit = picker.pick(camera, x, y, 0.005, 'any');

    expect(hit?.ref.kind).toBe('face');
  });

  it('refuses an edge pick when the cursor is not on a seam', () => {
    const picker = new Picker();
    picker.setGeometry(cube(), refs);
    const camera = overheadCamera();

    const [x, y] = ndcOf(camera, 5, 5, 10);
    expect(picker.pick(camera, x, y, 0.005, 'edge')).toBeNull();
  });

  it('reports nothing rather than guessing when faces have no names yet', () => {
    // Geometry can be displayed before naming has run. Inventing a reference here is the failure
    // this design exists to prevent.
    const picker = new Picker();
    picker.setGeometry(cube(), []);
    const camera = overheadCamera();

    const [x, y] = ndcOf(camera, 5, 5, 10);
    expect(picker.faceAt(camera, x, y)).toBe(1);
    expect(picker.pick(camera, x, y, 0.005)).toBeNull();
  });

  it('picks no corner hidden behind the part', () => {
    const picker = new Picker();
    picker.setGeometry(cube(), refs);
    const camera = angledCamera();

    // The bottom corner at the back, behind the cube from this side.
    const [x, y] = ndcOf(camera, 0, 10, 0);
    expect(picker.pick(camera, x, y, 0.02, 'vertex')).toBeNull();
  });
});

describe('indexFaceVertices', () => {
  it('groups every triangle under the face it came from', () => {
    const index = indexFaceVertices(cube());

    expect(index.faceCount).toBe(6);
    // Two triangles per face, three vertices each.
    for (let face = 0; face < 6; face++) {
      const from = index.offsets[face] ?? 0;
      const to = index.offsets[face + 1] ?? 0;
      expect(to - from).toBe(6);
    }
  });

  it('lists the corners the top face is actually built from', () => {
    const index = indexFaceVertices(cube());
    const from = index.offsets[1] ?? 0;
    const to = index.offsets[2] ?? 0;

    const vertices = new Set(Array.from(index.vertices.slice(from, to)));
    expect(vertices).toEqual(new Set([4, 5, 6, 7]));
  });
});
