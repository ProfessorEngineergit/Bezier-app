/**
 * The key light, carried with the camera. Set once per frame from the render loop (`scene.ts`);
 * nothing allocates.
 */

import { type Camera, type DirectionalLight, Vector3 } from 'three';

const keyOffset = new Vector3();
const keyRight = new Vector3();
const keyUp = new Vector3();

/**
 * Points the key light from over the camera's shoulder (up and left), so adjacent faces get
 * different intensity; a light at the eye shades them alike. Offsets are fractions of the viewing
 * distance, so shading does not shift while zooming.
 */
export function aimKeyLight(key: DirectionalLight, camera: Camera, target: Vector3): void {
  keyOffset.subVectors(camera.position, target);
  const reach = keyOffset.length();
  if (reach < 1e-6) return;

  keyRight.crossVectors(keyOffset, camera.up);
  // Degenerate when looking along the camera's up vector (axis views); the light stays on the view
  // axis there.
  if (keyRight.lengthSq() > 1e-12) {
    keyRight.normalize();
    keyUp.crossVectors(keyRight, keyOffset).normalize();
    keyOffset.addScaledVector(keyRight, -0.45 * reach).addScaledVector(keyUp, 0.35 * reach);
  }

  // The target stays at the origin, so only the position's direction matters.
  key.position.copy(keyOffset);
}
