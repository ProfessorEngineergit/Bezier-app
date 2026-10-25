import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GLIDE_MS, type Glide, glidePose, planGlide } from './camera-glide.js';

const origin = new Vector3();

function plan(from: Vector3, to: Vector3): Glide {
  const glide = planGlide(
    { position: from, target: origin, zoom: 1 },
    { position: to, target: origin },
    false,
    0,
  );
  if (typeof glide === 'string') throw new Error(`no glide: ${glide}`);
  return glide;
}

function headingAt(glide: Glide, t: number): number {
  const target = new Vector3();
  const position = new Vector3();
  glidePose(glide, t * GLIDE_MS, target, position);
  return Math.atan2(position.y, position.x);
}

describe('camera glide', () => {
  it('turns a view from above evenly, not all at the end', () => {
    // Three-quarter view to the top, whose on-screen turn is its heading: the top view keeps a hair
    // of offset towards the front, as the controls do.
    const glide = plan(
      new Vector3(1, 1, 1).setLength(100),
      new Vector3(0, -1e-3, 1).setLength(100),
    );
    const start = headingAt(glide, 0);
    const end = headingAt(glide, 1);
    const eased = (t: number) => 1 - (1 - t) ** 3;
    for (const t of [0.25, 0.5, 0.75]) {
      const share = (headingAt(glide, t) - start) / (end - start);
      expect(share).toBeCloseTo(eased(t), 3);
    }
  });

  it('lands exactly on the recorded end', () => {
    const to = new Vector3(0, -100, 0);
    const glide = plan(new Vector3(100, 0, 0), to);
    const target = new Vector3();
    const position = new Vector3();
    expect(glidePose(glide, GLIDE_MS, target, position)).toBe(true);
    expect(position.distanceTo(to)).toBeLessThan(1e-9);
  });

  it('walks round to the opposite side instead of through the model', () => {
    const glide = plan(new Vector3(0, -100, 0), new Vector3(0, 100, 0));
    const target = new Vector3();
    const position = new Vector3();
    glidePose(glide, GLIDE_MS / 2, target, position);
    expect(position.length()).toBeCloseTo(100, 6);
  });

  it('tilts straight up from the pole without spinning', () => {
    const glide = plan(new Vector3(0, 0, 100), new Vector3(0, -100, 0));
    expect(glide.azimuthTurn).toBe(0);
  });
});
