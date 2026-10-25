/**
 * Studio lighting fixed to the world, not the camera: two soft boxes (high left, low right) so a
 * rounded edge carries a band of light and a plate's top is lighter than its side. Plain lights
 * instead of a PMREM environment, which cost over a second per editor open.
 */

import { DirectionalLight, type Scene } from 'three';

export function addStudioLights(scene: Scene): void {
  const high = new DirectionalLight(0xffffff, 1.1);
  high.position.set(-18, -14, 26);
  const low = new DirectionalLight(0xdfe8ff, 0.6);
  low.position.set(22, 10, 8);
  scene.add(high, low);
}
