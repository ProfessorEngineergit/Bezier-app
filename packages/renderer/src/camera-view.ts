/**
 * A camera the user saved by name and goes back to (audit F-034): where it stands, what it looks at
 * and how it projects. Read off the scene and put back through its public controls.
 */
import type { ViewportScene } from './scene.js';
import type { CameraView } from './viewport-api.js';

export function viewOf(scene: ViewportScene): CameraView {
  const { x, y, z } = scene.camera.position;
  const t = scene.controls.target;
  const parallel = scene.isOrthographic;
  return {
    position: [x, y, z],
    target: [t.x, t.y, t.z],
    parallel,
    zoom: parallel ? scene.camera.zoom : 1,
  };
}

/** Placed under the lens first, so a parallel box is then sized from where the camera stands. */
export function showView(scene: ViewportScene, view: CameraView): void {
  // A turn of nothing: stops a glide under way and leaves the lens on.
  scene.orbit(0, 0);
  scene.controls.target.set(...view.target);
  scene.camera.position.set(...view.position);
  scene.controls.update();
  scene.setOrthographic(view.parallel);
  if (view.parallel) {
    scene.camera.zoom = view.zoom;
    scene.camera.updateProjectionMatrix();
  }
  scene.invalidate();
}
