/**
 * Lets a turntable orbit go over the poles. When a vertical drag would pass a pole, the camera
 * moves to the far side and its `up` flips, so the picture and drag continue without a jump.
 * Nothing else about the controls changes.
 */

import { type PerspectiveCamera, type Quaternion, Spherical, Vector3 } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** The parts of OrbitControls this reaches into (three 0.185). */
interface Tumbling {
  _rotateUp(angle: number): void;
  _sphericalDelta: Spherical;
  _quat: Quaternion;
  _quatInverse: Quaternion;
}

const Y = new Vector3(0, 1, 0);
const offset = new Vector3();
const spherical = new Spherical();
const found = new Spherical();

/** Keep OrbitControls' idea of "up" in step with the camera's, after either has changed it. */
export function syncUp(controls: OrbitControls): void {
  const inner = controls as unknown as Tumbling;
  inner._quat.setFromUnitVectors(controls.object.up, Y);
  inner._quatInverse.copy(inner._quat).invert();
}

/**
 * A polar angle moved by `by` without clamping at the poles, and whether it crossed one. Angles are
 * measured from up: 0 at the top, π at the bottom.
 */
export function overThePole(phi: number, by: number): { phi: number; flipped: boolean } {
  const next = phi + by;
  if (next < 0) return { phi: -next, flipped: true };
  if (next > Math.PI) return { phi: 2 * Math.PI - next, flipped: true };
  return { phi: next, flipped: false };
}

/** Let a vertical orbit go over the poles. Called once, when the controls are made. */
export function allowTumble(controls: OrbitControls): void {
  const inner = controls as unknown as Tumbling;
  const ordinary = inner._rotateUp.bind(controls);
  inner._rotateUp = (angle: number) => {
    const camera = controls.object as PerspectiveCamera;
    offset.copy(camera.position).sub(controls.target).applyQuaternion(inner._quat);
    spherical.setFromVector3(offset);
    // OrbitControls moves up by taking the angle off the polar one.
    const over = overThePole(spherical.phi, -angle);
    if (!over.flipped || spherical.radius === 0) {
      ordinary(angle);
      return;
    }
    // On the far side of the model, in the frame the controls work in, then back to the world.
    found.set(spherical.radius, over.phi, spherical.theta + Math.PI);
    offset.setFromSpherical(found).applyQuaternion(inner._quatInverse);
    camera.position.copy(controls.target).add(offset);
    // Flip the camera's up so the picture does not jump.
    camera.up.negate();
    syncUp(controls);
    inner._sphericalDelta.phi = 0;
    // A pending azimuth change now turns the other way.
    inner._sphericalDelta.theta = -inner._sphericalDelta.theta;
    camera.lookAt(controls.target);
  };
}
