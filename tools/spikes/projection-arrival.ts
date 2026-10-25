import { CameraRig } from '../../packages/renderer/src/camera.js';

/**
 * Measures projected width during the perspective-to-orthographic morph for a face in front of the
 * target, which checks on the target plane alone miss.
 */
export function projectionArrival() {
  const rig = new CameraRig();
  const target = rig.perspective.position.clone().set(0, 0, 0);
  rig.setAspect(1, 100);
  rig.perspective.position.set(0, 0, 100);
  rig.perspective.lookAt(target);
  rig.perspective.updateMatrixWorld();
  const widths: number[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    rig.morphToOrthographic(1 - (1 - t) ** 3, 100);
    widths.push(
      target.clone().set(20, 0, 30).project(rig.active).x -
        target.clone().set(-20, 0, 30).project(rig.active).x,
    );
  }
  rig.setOrthographic(true, target);
  const arrival =
    target.clone().set(20, 0, 30).project(rig.active).x -
    target.clone().set(-20, 0, 30).project(rig.active).x;
  return { widths, arrival, jump: Math.abs(arrival - (widths.at(-1) ?? 0)) };
}
