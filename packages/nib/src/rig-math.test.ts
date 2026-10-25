import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { gltfEuler, modelEuler } from './rig-math.js';

const forward = () => new Vector3(0, 0, 1); // Nib faces +z in glTF, -y in the model

describe('model space to glTF space', () => {
  it("turns a yaw about the model's up axis into a turn about glTF's up axis", () => {
    // 90 degrees about z in the model sends -y (forward) to +x; in glTF forward is +z and it must go to +x.
    const turned = forward().applyQuaternion(gltfEuler(0, 0, 90, new Quaternion()));
    expect(turned.x).toBeCloseTo(1, 6);
    expect(turned.y).toBeCloseTo(0, 6);
    expect(turned.z).toBeCloseTo(0, 6);
  });

  it('makes a positive pitch lean forward and down', () => {
    const leaned = forward().applyQuaternion(gltfEuler(90, 0, 0, new Quaternion()));
    expect(leaned.y).toBeCloseTo(-1, 6);
    expect(leaned.z).toBeCloseTo(0, 6);
  });

  it("applies x, then y, then z, like the film's rig", () => {
    const q = modelEuler(30, 20, 10, new Quaternion());
    const stepwise = new Vector3(0, -1, 0)
      .applyAxisAngle(new Vector3(1, 0, 0), (30 * Math.PI) / 180)
      .applyAxisAngle(new Vector3(0, 1, 0), (20 * Math.PI) / 180)
      .applyAxisAngle(new Vector3(0, 0, 1), (10 * Math.PI) / 180);
    // Rotating about fixed axes in that order is the same as one quaternion z * y * x.
    const direct = new Vector3(0, -1, 0).applyQuaternion(q);
    expect(direct.distanceTo(stepwise)).toBeLessThan(1e-6);
  });

  it('keeps a rotation of nothing as nothing', () => {
    const q = gltfEuler(0, 0, 0, new Quaternion());
    expect(q.angleTo(new Quaternion())).toBeCloseTo(0, 6);
  });
});
