import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig } from './camera.js';
import {
  batchesOf,
  COARSE,
  choose,
  DRAWN_AS_FINE,
  FINE,
  joinRuns,
  levelFor,
  measureSolids,
  nextToRefine,
  optionsAt,
  REFINED,
  runs,
  SKIP,
  thresholdsFor,
  ViewSnapshot,
} from './solid-lod.js';

/** A camera at the origin looking down -Z, 1000 px tall, 60° lens. */
function view(): ViewSnapshot {
  const camera = new PerspectiveCamera(60, 1, 0.1, 10_000);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const snapshot = new ViewSnapshot();
  snapshot.update(camera, 1000);
  return snapshot;
}

/** Spheres as [x, y, z, r] per solid. */
const spheres = (...all: number[][]) => Float32Array.from(all.flat());

describe('measuring each part of a model', () => {
  it('puts a sphere round each run of vertices', () => {
    const positions = Float32Array.from([0, 0, 0, 2, 0, 0, 10, 10, 10, 10, 12, 10]);
    const out = new Float32Array(8);
    for (const _ of measureSolids(positions, Uint32Array.from([0, 2, 4]), out));
    expect([...out]).toEqual([1, 0, 0, 1, 10, 11, 10, 1]);
  });
});

describe('deciding how to draw each part', () => {
  const four = spheres(
    [0, 0, -100, 10], // near and large
    [0, 0, -5000, 1], // far and tiny: well under a pixel
    [0, 0, 500, 10], // behind the camera
    [30, 0, -100, 5], // near, and a finer mesh is ready
  );

  it('leaves out what is behind the camera, and only that, while still', () => {
    const choice = new Uint8Array(4);
    const limits = thresholdsFor(false, 0, { cullPx: 0, coarsePx: 0, refined: false });
    choose(four, view(), new Uint8Array(4).fill(1), Uint8Array.from([0, 0, 0, 1]), limits, choice);
    expect([...choice]).toEqual([FINE, FINE, SKIP, REFINED]);
  });

  it('leaves out the tiny and draws the small coarse while moving under pressure', () => {
    const choice = new Uint8Array(4);
    const limits = thresholdsFor(true, 1, { cullPx: 0, coarsePx: 0, refined: false });
    choose(four, view(), new Uint8Array(4).fill(1), Uint8Array.from([0, 0, 0, 1]), limits, choice);
    // The near one is 87 px across: coarse under full pressure. The finer mesh waits.
    expect([...choice]).toEqual([COARSE, SKIP, SKIP, COARSE]);
  });
});

describe('which parts keep their outlines', () => {
  const four = spheres(
    [0, 0, -100, 10], // 87 px across
    [0, 0, -5000, 1], // under a pixel
    [0, 0, -400, 2], // a few pixels
    [30, 0, -100, 5],
  );

  it('are all of them while still', () => {
    const outlined = new Uint8Array(4);
    const limits = thresholdsFor(false, 0, { cullPx: 0, coarsePx: 0, refined: false });
    choose(
      four,
      view(),
      new Uint8Array(4).fill(1),
      new Uint8Array(4),
      limits,
      new Uint8Array(4),
      outlined,
    );
    expect([...outlined]).toEqual([1, 1, 1, 1]);
  });

  it('are the larger parts while moving, and fewer as frames run late', () => {
    const quiet = new Uint8Array(4);
    const busy = new Uint8Array(4);
    const calm = thresholdsFor(true, 0, { cullPx: 0, coarsePx: 0, refined: false });
    choose(
      four,
      view(),
      new Uint8Array(4).fill(1),
      new Uint8Array(4),
      calm,
      new Uint8Array(4),
      quiet,
    );
    expect(quiet[0]).toBe(1);
    expect(quiet[1]).toBe(0);
    const late = thresholdsFor(true, 1, { cullPx: 0, coarsePx: 0, refined: false });
    choose(
      four,
      view(),
      new Uint8Array(4).fill(1),
      new Uint8Array(4),
      late,
      new Uint8Array(4),
      busy,
    );
    expect([...busy].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      [...quiet].reduce((a, b) => a + b, 0),
    );
  });
});

describe('runs of parts drawn alike', () => {
  const starts = Uint32Array.from([0, 10, 20, 30, 40, 50]);

  it('are one draw each, and draw through a small gap of parts left out', () => {
    const out = new Uint32Array(12);
    const choice = Uint8Array.from([FINE, SKIP, FINE, COARSE, FINE]);
    const count = runs(choice, DRAWN_AS_FINE, 0, 5, starts, 0, 3, 15, out);
    // Through the skipped one (10 < 15); never through the coarse one.
    expect([...out.subarray(0, count * 2)]).toEqual([0, 90, 120, 30]);
  });

  it('stop at a gap too long to draw through', () => {
    const out = new Uint32Array(12);
    const choice = Uint8Array.from([FINE, SKIP, SKIP, FINE, FINE]);
    const count = runs(choice, DRAWN_AS_FINE, 0, 5, starts, 0, 1, 15, out);
    expect([...out.subarray(0, count * 2)]).toEqual([0, 10, 30, 20]);
  });

  it('take a small coarse part in with its fine neighbours', () => {
    const choice = Uint8Array.from([FINE, COARSE, SKIP, FINE, COARSE]);
    joinRuns(choice, starts, 25);
    expect([...choice]).toEqual([FINE, FINE, SKIP, FINE, COARSE]);
  });
});

describe('how much finer to draw a part', () => {
  const base = { linearDeflection: 0.2, angularDeflection: 0.4 };

  it('asks for nothing when a chord is under half a pixel already', () => {
    expect(levelFor(base, 1)).toBe(0);
    expect(levelFor(base, 0.1)).toBe(2);
    expect(levelFor(base, 0.0001)).toBe(4);
    expect(optionsAt(base, 2)).toEqual({ linearDeflection: 0.05, angularDeflection: 0.2 });
  });

  it('picks the largest part in view whose facets would show', () => {
    const all = spheres([0, 0, -100, 10], [0, 0, -30, 10], [0, 0, 500, 50]);
    const triangles = Uint32Array.from([0, 100, 200, 300]);
    const levels = new Uint8Array(3);
    const next = nextToRefine(all, triangles, view(), base, levels, new Uint8Array(3));
    expect(next?.solid).toBe(1);
    levels[1] = next?.level ?? 0;
    expect(nextToRefine(all, triangles, view(), base, levels, new Uint8Array(3))?.solid).toBe(0);
  });
});

describe('asking for coarse parts', () => {
  it('asks in batches that each stay about one size', () => {
    const triangles = Uint32Array.from([0, 50, 60, 200, 210, 220]);
    expect(batchesOf(triangles, 100)).toEqual([
      [0, 3],
      [3, 5],
    ]);
  });
});

describe('the size of a part on screen while the projection changes', () => {
  /**
   * Flying to a squared-up view blends the lens into the parallel box (`CameraRig.
   * morphToOrthographic`), which rewrites the perspective camera's projection matrix. Read off it
   * as a plain lens, a part's on-screen size comes out a few hundred times too small, and every
   * part is left out as a speck until the flight ends.
   */
  function sizeAt(mix: number): number {
    const rig = new CameraRig();
    rig.perspective.position.set(0, -1000, 0);
    rig.perspective.lookAt(0, 0, 0);
    rig.perspective.updateMatrixWorld();
    rig.morphToOrthographic(mix, 1000);
    const snapshot = new ViewSnapshot();
    snapshot.update(rig.perspective, 900);
    return snapshot.pixels(0, 0, 0, 100);
  }

  it('stays about the size it is at the start and the end of the blend', () => {
    const lens = sizeAt(0);
    const box = sizeAt(1);
    expect(lens).toBeGreaterThan(50);
    for (const mix of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const now = sizeAt(mix);
      expect(now).toBeGreaterThan(Math.min(lens, box) * 0.8);
      expect(now).toBeLessThan(Math.max(lens, box) * 1.25);
    }
  });
});
