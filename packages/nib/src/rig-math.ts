/**
 * Rig math in the model's space (Blender: z up, Nib faces -y, Euler XYZ), as in the film's rig,
 * converted to glTF space (y up, Nib faces +z) only when written to a node. This keeps every sign
 * identical to the film's rig.
 */

import { Quaternion, Vector3 } from 'three';

const DEG = Math.PI / 180;
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

/** Axis change: a quarter turn about x. Model (x, y, z) is glTF (x, z, -y). */
const TO_GLTF = new Quaternion().setFromAxisAngle(X, -Math.PI / 2);
const FROM_GLTF = TO_GLTF.clone().invert();

const qx = new Quaternion();
const qy = new Quaternion();
const qz = new Quaternion();

/** A model-space Euler rotation (degrees, XYZ order) as a model-space quaternion. */
export function modelEuler(x: number, y: number, z: number, out: Quaternion): Quaternion {
  qx.setFromAxisAngle(X, x * DEG);
  qy.setFromAxisAngle(Y, y * DEG);
  qz.setFromAxisAngle(Z, z * DEG);
  return out.copy(qz).multiply(qy).multiply(qx);
}

/** A rotation in model space, written for a glTF node. */
export function toGltfRotation(q: Quaternion): Quaternion {
  return q.premultiply(TO_GLTF).multiply(FROM_GLTF);
}

/** A model-space Euler rotation as a glTF node quaternion. */
export function gltfEuler(x: number, y: number, z: number, out: Quaternion): Quaternion {
  return toGltfRotation(modelEuler(x, y, z, out));
}

/** A model-space offset, added to a glTF node's position. */
export function addModelOffset(
  target: Vector3,
  x: number,
  y: number,
  z: number,
  rest: Vector3,
): Vector3 {
  return target.set(rest.x + x, rest.y + z, rest.z - y);
}

/** Rotation about one model-space axis, for the lid pivot. */
export function modelAxis(axis: 'x' | 'z', degrees: number, out: Quaternion): Quaternion {
  return out.setFromAxisAngle(axis === 'x' ? X : Z, degrees * DEG);
}
