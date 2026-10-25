import { describe, expect, it } from 'vitest';
import { projectDirection } from './gizmo-direction.js';

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V): V => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** A lens at `eye` looking at `target`, Z up, 45° high, in a 1280 × 720 view. */
function view(eye: V, target: V) {
  const forward = unit(sub(target, eye));
  const right = unit(cross(forward, [0, 0, 1]));
  const up = cross(right, forward);
  const half = Math.tan((45 * Math.PI) / 360);
  return {
    cameraPosition: () => ({ x: eye[0], y: eye[1], z: eye[2] }),
    project: (x: number, y: number, z: number) => {
      const d = sub([x, y, z], eye);
      const depth = dot(d, forward);
      const nx = dot(d, right) / (depth * half * (1280 / 720));
      const ny = dot(d, up) / (depth * half);
      return { x: ((nx + 1) / 2) * 1280, y: ((1 - ny) / 2) * 720 };
    },
  };
}

function arrow(handle: ReturnType<typeof view>, anchor: [number, number, number]) {
  const at = handle.project(...anchor);
  const out = { x: 0, y: 0 };
  const ok = projectDirection(
    handle,
    { x: anchor[0], y: anchor[1], z: anchor[2] },
    { x: 0, y: 0, z: 1 },
    at,
    out,
  );
  return ok ? out : null;
}

describe('the direction an arrow points on screen', () => {
  it('points straight up the screen for the floor seen from above, wherever on the floor', () => {
    // Nearly straight down, the floor's normal pointing at the eye: it must not slant below the
    // middle of the view either.
    const handle = view([0, -5, 200], [0, 0, 0]);
    for (const anchor of [
      [0, 0, 0],
      [0, -60, 0],
      [50, -50, 0],
    ] as [number, number, number][]) {
      const out = arrow(handle, anchor);
      expect(out).not.toBeNull();
      expect(out?.y).toBeLessThan(-0.95);
    }
  });

  it('follows the projected direction where it can be seen as one', () => {
    const handle = view([100, -100, 80], [0, 0, 0]);
    const out = arrow(handle, [0, 0, 0]);
    const tip = handle.project(0, 0, 1);
    const at = handle.project(0, 0, 0);
    const length = Math.hypot(tip.x - at.x, tip.y - at.y);
    expect(out?.x).toBeCloseTo((tip.x - at.x) / length, 5);
    expect(out?.y).toBeCloseTo((tip.y - at.y) / length, 5);
  });

  it('points down the screen for a direction pointing away from the eye', () => {
    const handle = view([0, -5, -200], [0, 0, 0]);
    expect(arrow(handle, [0, -40, 0])?.y).toBeGreaterThan(0.99);
  });
});
