/**
 * A PNG of the view. `scale` renders at a multiple of the canvas size (real detail, not upscaling)
 * and restores the size afterwards. `transparent` clears to zero alpha, which needs the renderer's
 * alpha buffer.
 */

import { type Camera, type Scene, Vector2, type WebGLRenderer } from 'three';

/**
 * Serialises captures: an overlapping capture would read the resized buffer as the real size and
 * restore that. Overlaps happen with React's double effects in development and multi-view captures.
 */
let last: Promise<unknown> = Promise.resolve();

export function capture(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  options: { scale?: number; transparent?: boolean },
  restored: () => void,
): Promise<Blob | null> {
  const run = () => shoot(renderer, scene, camera, options, restored);
  const next = last.then(run, run);
  last = next.catch(() => undefined);
  return next;
}

function shoot(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  options: { scale?: number; transparent?: boolean },
  restored: () => void,
): Promise<Blob | null> {
  const scale = options.scale ?? 1;
  const size = new Vector2();
  renderer.getSize(size);

  const back = () => {
    if (options.transparent === true) renderer.setClearAlpha(1);
    if (scale !== 1) renderer.setSize(size.x, size.y, false);
    restored();
  };

  if (scale !== 1) renderer.setSize(size.x * scale, size.y * scale, false);
  if (options.transparent === true) renderer.setClearAlpha(0);

  return new Promise((resolve, reject) => {
    // Restore the size even if rendering or reading fails.
    try {
      renderer.render(scene, camera);
      renderer.domElement.toBlob((blob) => {
        back();
        resolve(blob);
      }, 'image/png');
    } catch (error) {
      back();
      reject(error);
    }
  });
}
