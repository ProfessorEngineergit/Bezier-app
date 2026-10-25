import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { frameBounds, type Vec3 } from './framing.js';

/** The part the rest of the repository uses as its example: 40 × 20 × 15 mm. */
const MIN: Vec3 = { x: 0, y: 0, z: 0 };
const MAX: Vec3 = { x: 40, y: 20, z: 15 };

const FOV = 45;

/**
 * How much of the frame the model covers, as a fraction of NDC. This is the measurement that
 * matters and the one that cannot be made by reading the formula: build the camera the framing asks
 * for, project all eight corners and see how much of the screen they span. 1 means edge to edge.
 */
function coverage(min: Vec3, max: Vec3, aspect: number, direction?: Vec3) {
  const framing =
    direction === undefined
      ? frameBounds(min, max, FOV, aspect)
      : frameBounds(min, max, FOV, aspect, direction);

  const camera = new PerspectiveCamera(FOV, aspect, framing.near, framing.far);
  // Z-up, matching the scene and `frameBounds`. Three's default Y-up here would test the framing
  // against a basis the application never uses.
  camera.up.set(0, 0, 1);
  camera.position.set(framing.position.x, framing.position.y, framing.position.z);
  camera.lookAt(framing.target.x, framing.target.y, framing.target.z);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  let maxX = 0;
  let maxY = 0;
  let behind = false;
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        const point = new Vector3(x, y, z);
        const view = point.clone().applyMatrix4(camera.matrixWorldInverse);
        if (view.z > -framing.near) behind = true;
        point.project(camera);
        maxX = Math.max(maxX, Math.abs(point.x));
        maxY = Math.max(maxY, Math.abs(point.y));
      }
    }
  }
  return { maxX, maxY, behind, framing };
}

describe('frameBounds', () => {
  it('keeps the whole model on screen', () => {
    const { maxX, maxY } = coverage(MIN, MAX, 16 / 9);
    expect(maxX).toBeLessThanOrEqual(1);
    expect(maxY).toBeLessThanOrEqual(1);
  });

  it('fills the frame rather than leaving the model adrift in it', () => {
    // A bounding-sphere fit with a 1.35 margin puts a 40 mm part at about a quarter of the frame,
    // which reads as zoomed out, not framed.
    const { maxX, maxY } = coverage(MIN, MAX, 16 / 9);
    expect(Math.max(maxX, maxY)).toBeGreaterThan(0.8);
  });

  it('fills a tall narrow viewport too', () => {
    // The shape of the viewport in the app when both side panels are open, and the case where
    // fitting by height alone crops a wide model.
    const { maxX, maxY } = coverage(MIN, MAX, 0.45);
    expect(maxX).toBeLessThanOrEqual(1);
    expect(maxY).toBeLessThanOrEqual(1);
    expect(Math.max(maxX, maxY)).toBeGreaterThan(0.8);
  });

  it('fills a very wide viewport too', () => {
    const { maxX, maxY } = coverage(MIN, MAX, 3.5);
    expect(maxX).toBeLessThanOrEqual(1);
    expect(Math.max(maxX, maxY)).toBeGreaterThan(0.8);
  });

  it('keeps the model in front of the near plane', () => {
    // Backing off by the frustum distance alone puts the centre at that distance and leaves the
    // near half of the model behind the camera.
    const { behind } = coverage(MIN, MAX, 16 / 9);
    expect(behind).toBe(false);
  });

  it('looks from the direction it was given', () => {
    const direction = { x: 0, y: -1, z: 0 };
    const { framing } = coverage(MIN, MAX, 16 / 9, direction);

    // Straight along -Y from the centre: same x and z, smaller y.
    expect(framing.position.x).toBeCloseTo(20);
    expect(framing.position.z).toBeCloseTo(7.5);
    expect(framing.position.y).toBeLessThan(0);
  });

  it('is idempotent — framing an already framed model changes nothing', () => {
    // Re-framing must be a no-op, or every rebuild nudges the camera and the model creeps across
    // the screen over a long editing session.
    const first = frameBounds(MIN, MAX, FOV, 16 / 9);
    const direction = {
      x: first.position.x - first.target.x,
      y: first.position.y - first.target.y,
      z: first.position.z - first.target.z,
    };
    const second = frameBounds(MIN, MAX, FOV, 16 / 9, direction);

    expect(second.position.x).toBeCloseTo(first.position.x, 6);
    expect(second.position.y).toBeCloseTo(first.position.y, 6);
    expect(second.position.z).toBeCloseTo(first.position.z, 6);
  });

  it('scales with the model rather than assuming millimetres', () => {
    const small = frameBounds(MIN, { x: 4, y: 2, z: 1.5 }, FOV, 16 / 9);
    const large = frameBounds(MIN, { x: 400, y: 200, z: 150 }, FOV, 16 / 9);

    const reach = (f: typeof small) =>
      Math.hypot(f.position.x - f.target.x, f.position.y - f.target.y, f.position.z - f.target.z);

    expect(reach(large) / reach(small)).toBeCloseTo(100, 0);
  });

  it('survives a degenerate model without dividing by zero', () => {
    // A sketch with no extrusion yet is a flat, or even a single point.
    const flat = frameBounds(MIN, { x: 40, y: 20, z: 0 }, FOV, 16 / 9);
    expect(Number.isFinite(flat.position.z)).toBe(true);

    const point = frameBounds(MIN, MIN, FOV, 16 / 9);
    expect(Number.isFinite(point.position.x)).toBe(true);
    expect(point.near).toBeGreaterThan(0);
    expect(point.far).toBeGreaterThan(point.near);
  });

  it('ignores a zero direction rather than producing NaN', () => {
    const framing = frameBounds(MIN, MAX, FOV, 16 / 9, { x: 0, y: 0, z: 0 });
    expect(Number.isFinite(framing.position.x)).toBe(true);
    expect(Number.isFinite(framing.position.y)).toBe(true);
    expect(Number.isFinite(framing.position.z)).toBe(true);
  });
});
