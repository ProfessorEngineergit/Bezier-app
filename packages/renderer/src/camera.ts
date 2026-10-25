/**
 * The perspective and orthographic cameras and switching between them. Perspective for working
 * views, a true parallel projection for square views (a narrow field of view still tapers and
 * forces a distant near plane). Switching copies the pose so only the projection changes.
 */

import { type Camera, Matrix4, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { syncUp } from './tumble.js';

/** Reused when converting a parallel zoom back into a viewing distance. */
const scratchOffset = new Vector3();
const scratchMatrix = new Matrix4();
/** diag(1, -1, 1): the one axis CSS and the scene disagree about. */
const FLIP_Y = new Matrix4().makeScale(1, -1, 1);

/** Whichever camera is currently drawing. Both project; only one is live. */
export type ActiveCamera = PerspectiveCamera | OrthographicCamera;

/** The working lens angle, in degrees. Wide enough to read depth, narrow enough not to distort. */
const DEFAULT_FOV = 45;

export class CameraRig {
  readonly perspective: PerspectiveCamera;
  readonly orthographic: OrthographicCamera;

  #orthographic = false;
  #aspect = 1;
  /**
   * From the view settings: parallel in every direction. Otherwise parallel is only held while
   * square to an axis.
   */
  parallelAlways = false;

  /**
   * The camera's orientation as a CSS `matrix3d` for the DOM view cube: S · R · S with
   * S = diag(1,-1,1), since CSS counts Y downward.
   */
  static cubeMatrix(camera: Camera): readonly number[] {
    scratchMatrix.extractRotation(camera.matrixWorldInverse);
    scratchMatrix.premultiply(FLIP_Y).multiply(FLIP_Y);
    return scratchMatrix.elements;
  }

  constructor() {
    this.perspective = new PerspectiveCamera(DEFAULT_FOV, 1, 0.1, 10_000);
    // Z-up (sketches on XY, extruded along Z). Both cameras need it, or switching tips the model.
    this.perspective.up.set(0, 0, 1);
    this.perspective.position.set(120, -160, 110);

    // Placeholder frustum: recomputed from the viewing distance before this camera is shown.
    this.orthographic = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10_000);
    this.orthographic.up.set(0, 0, 1);
    this.orthographic.position.copy(this.perspective.position);
  }

  get active(): ActiveCamera {
    return this.#orthographic ? this.orthographic : this.perspective;
  }

  get isOrthographic(): boolean {
    return this.#orthographic;
  }

  /** The lens angle the framing maths uses, whichever camera is live. */
  get fov(): number {
    return this.perspective.fov;
  }

  get aspect(): number {
    return this.#aspect;
  }

  setFieldOfView(degrees: number, distance: number, target?: Vector3): void {
    const before = Math.tan((this.perspective.fov * Math.PI) / 360);
    this.perspective.fov = Math.max(1, Math.min(90, degrees));
    this.perspective.updateProjectionMatrix();
    // Back the camera off as the angle narrows so the framing is kept (audit F-036).
    const after = Math.tan((this.perspective.fov * Math.PI) / 360);
    if (target !== undefined && !this.#orthographic && after > 0) {
      scratchOffset
        .copy(this.perspective.position)
        .sub(target)
        .multiplyScalar(before / after);
      this.perspective.position.copy(target).add(scratchOffset);
      this.perspective.far = Math.max(this.perspective.far, scratchOffset.length() * 4);
      this.perspective.updateProjectionMatrix();
    }
    // The orthographic box is derived from the lens, so rebuild it too.
    if (this.#orthographic) this.matchFrustum(distance);
  }

  setAspect(aspect: number, distance: number): void {
    this.#aspect = aspect;
    this.perspective.aspect = aspect;
    this.perspective.updateProjectionMatrix();
    if (this.#orthographic) this.matchFrustum(distance);
  }

  /**
   * Sizes the parallel box to the height the lens sees at `distance`: `2·d·tan(fov/2)`. `zoom` is
   * left alone, since the controls dolly an orthographic camera through it.
   */
  matchFrustum(distance: number): void {
    const halfHeight = Math.max(1e-3, distance) * Math.tan((this.perspective.fov * Math.PI) / 360);
    const halfWidth = halfHeight * this.#aspect;
    this.orthographic.top = halfHeight;
    this.orthographic.bottom = -halfHeight;
    this.orthographic.right = halfWidth;
    this.orthographic.left = -halfWidth;
    this.orthographic.updateProjectionMatrix();
  }

  /** A gradual projection change avoids the final shrink of faces nearer than the orbit centre. */
  morphToOrthographic(amount: number, distance: number): void {
    if (this.#orthographic) return;
    const d = Math.max(1e-3, distance);
    const mix = Math.min(1, Math.max(0, amount));
    this.perspective.updateProjectionMatrix();
    this.orthographic.near = this.perspective.near;
    this.orthographic.far = this.perspective.far;
    this.orthographic.zoom = 1;
    this.matchFrustum(d);
    const source = this.perspective.projectionMatrix.elements;
    const destination = this.orthographic.projectionMatrix.elements;
    // Projection matrices that differ by a scale are equivalent; dividing by distance gives w = 1
    // at the target for both.
    for (let i = 0; i < 16; i++)
      source[i] = ((source[i] ?? 0) / d) * (1 - mix) + (destination[i] ?? 0) * mix;
    this.perspective.projectionMatrixInverse.copy(this.perspective.projectionMatrix).invert();
  }

  /** Restores the camera's up after a tumble over a pole (`tumble.ts`), for named views. */
  uprightCamera(controls: OrbitControls): void {
    if (this.active.up.z === 1) return;
    this.perspective.up.set(0, 0, 1);
    this.orthographic.up.set(0, 0, 1);
    syncUp(controls);
  }

  /**
   * Switches projection, keeping the pose; returns whether anything changed. `target` is the orbit
   * centre, which gives the viewing distance the new frustum must match.
   */
  setOrthographic(wanted: boolean, target: Vector3): boolean {
    const on = wanted || this.parallelAlways;
    if (on === this.#orthographic) return false;
    const from = this.active;
    const to = on ? this.orthographic : this.perspective;

    to.position.copy(from.position);
    to.quaternion.copy(from.quaternion);
    to.up.copy(from.up);
    to.near = from.near;
    to.far = from.far;

    this.#orthographic = on;
    if (on) {
      // The frustum now carries the scale, so reset zoom to avoid counting it twice.
      this.orthographic.zoom = 1;
      this.matchFrustum(to.position.distanceTo(target));
    } else {
      // Convert the orthographic zoom back into a distance: the box height is 2·d·tan(fov/2) /
      // zoom, so the lens shows the same height from d / zoom.
      const zoom = this.orthographic.zoom;
      scratchOffset.copy(to.position).sub(target);
      if (zoom > 0 && scratchOffset.lengthSq() > 0) {
        to.position.copy(target).add(scratchOffset.divideScalar(zoom));
      }
    }
    to.updateProjectionMatrix();
    to.updateMatrixWorld();
    return true;
  }
}
