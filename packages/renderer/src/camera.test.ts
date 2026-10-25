import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig } from './camera.js';

/** How much world height a camera takes in at `distance`, in millimetres. */
function visibleHeight(rig: CameraRig, distance: number): number {
  if (rig.isOrthographic) {
    const camera = rig.orthographic;
    return (camera.top - camera.bottom) / camera.zoom;
  }
  return 2 * distance * Math.tan((rig.perspective.fov * Math.PI) / 360);
}

describe('CameraRig', () => {
  it('finishes a projection morph without a second scale jump on a foreground face', () => {
    const rig = new CameraRig();
    const target = new Vector3();
    rig.setAspect(1, 100);
    rig.perspective.position.set(0, 0, 100);
    rig.perspective.lookAt(target);
    rig.perspective.updateMatrixWorld();
    const point = new Vector3(20, 0, 30);
    const projected: number[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      rig.morphToOrthographic(1 - (1 - t) ** 3, 100);
      projected.push(point.clone().project(rig.active).x);
    }
    rig.setOrthographic(true, target);
    expect(point.clone().project(rig.active).x).toBeCloseTo(projected.at(-1) ?? 0, 9);
    expect(projected.every((x, i) => i === 0 || x <= (projected[i - 1] ?? 0))).toBe(true);
    expect(Math.abs((projected.at(-1) ?? 0) - (projected.at(-2) ?? 0))).toBeLessThan(0.001);
  });
  it('starts as a lens', () => {
    const rig = new CameraRig();
    expect(rig.isOrthographic).toBe(false);
    expect(rig.active).toBe(rig.perspective);
  });

  it('shows the model at the same size on the way into a parallel view', () => {
    // Why the frustum is matched: a switch that changed how much of the world was in shot would
    // read as a zoom, and the user asked for a projection change. The part must not appear to grow
    // or shrink.
    const rig = new CameraRig();
    const target = new Vector3(0, 0, 0);
    rig.setAspect(16 / 9, 200);
    rig.perspective.position.set(0, 0, 200);

    const before = visibleHeight(rig, 200);
    rig.setOrthographic(true, target);

    expect(rig.isOrthographic).toBe(true);
    expect(visibleHeight(rig, 200)).toBeCloseTo(before, 6);
  });

  it('carries the pose across so the switch is not also a move', () => {
    const rig = new CameraRig();
    rig.perspective.position.set(120, -160, 110);
    rig.perspective.updateMatrixWorld();

    rig.setOrthographic(true, new Vector3(0, 0, 0));

    expect(rig.orthographic.position.x).toBeCloseTo(120, 9);
    expect(rig.orthographic.position.y).toBeCloseTo(-160, 9);
    expect(rig.orthographic.position.z).toBeCloseTo(110, 9);
    // Z-up on both, or the model would tip over on the way through.
    expect(rig.orthographic.up.z).toBe(1);
  });

  it('keeps the aspect ratio square with the window', () => {
    const rig = new CameraRig();
    rig.setAspect(2, 100);
    rig.setOrthographic(true, new Vector3(0, 0, 0));
    rig.perspective.position.set(0, 0, 100);
    rig.matchFrustum(100);

    const width = rig.orthographic.right - rig.orthographic.left;
    const height = rig.orthographic.top - rig.orthographic.bottom;
    expect(width / height).toBeCloseTo(2, 9);
  });

  it('turns a parallel zoom back into a distance on the way out', () => {
    // A lens zooms by moving and a parallel view by narrowing its box, so the scroll a user did in
    // an orthographic view has nowhere to live once the lens is back unless it becomes a distance.
    // Without this the model snaps back to its old size the moment the view leaves an axis.
    const rig = new CameraRig();
    const target = new Vector3(0, 0, 0);
    rig.setAspect(1, 200);
    rig.perspective.position.set(0, 0, 200);
    rig.setOrthographic(true, target);

    // Scroll in, the way the controls dolly a parallel camera.
    rig.orthographic.zoom = 4;
    const zoomed = visibleHeight(rig, 200);

    rig.setOrthographic(false, target);

    const distance = rig.perspective.position.distanceTo(target);
    expect(distance).toBeCloseTo(50, 6);
    expect(visibleHeight(rig, distance)).toBeCloseTo(zoomed, 6);
  });

  it('reports no change when asked for the projection it already has', () => {
    const rig = new CameraRig();
    expect(rig.setOrthographic(false, new Vector3())).toBe(false);
    expect(rig.setOrthographic(true, new Vector3())).toBe(true);
    expect(rig.setOrthographic(true, new Vector3())).toBe(false);
  });

  it('keeps the parallel box tied to the lens angle', () => {
    // The field of view stays meaningful in both modes, so narrowing it takes in less of the world
    // either way and does not go dead in a squared-up view.
    const rig = new CameraRig();
    rig.setAspect(1, 100);
    rig.setOrthographic(true, new Vector3(0, 0, 0));
    rig.perspective.position.set(0, 0, 100);
    rig.matchFrustum(100);

    const wide = rig.orthographic.top - rig.orthographic.bottom;
    rig.setFieldOfView(20, 100);
    const narrow = rig.orthographic.top - rig.orthographic.bottom;

    expect(narrow).toBeLessThan(wide);
  });
});
