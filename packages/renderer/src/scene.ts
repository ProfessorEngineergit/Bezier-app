/**
 * The scene, cameras, controls and frame loop, owned imperatively: per ADR 0007 the render loop
 * never touches React.
 */

/// <reference lib="dom" />

import type { PlaneBasis } from '@bezier/core';
import type { Bounds } from '@bezier/kernel';
import type { Sketch, SketchId } from '@bezier/solver';
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Matrix4,
  Plane,
  Scene,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BackgroundWork, SLICE_MS } from './background-work.js';
import { type ActiveCamera, CameraRig } from './camera.js';
import { GLIDE_MS, type Glide, glidePose, planGlide } from './camera-glide.js';
import { capture } from './capture.js';
import { ContentReach, contentCenter } from './content-measure.js';
import { onTheCube } from './cube-directions.js';
import { FabricWarp } from './fabric.js';
import { FrameBudget } from './frame-budget.js';
import { frameBounds, withAir } from './framing.js';
import { gridReach } from './grid-lod.js';
import { createHelpers, type Helpers } from './helpers.js';
import { InteractionQuality } from './interaction-quality.js';
import { aimKeyLight } from './key-light.js';
import {
  installNavigation,
  type NavigationInput,
  type NavigationPrefs,
  type SurfaceProbe,
} from './navigation.js';
import { Redraw } from './redraw.js';
import { type ReferenceMesh, ReferenceMeshes } from './reference-meshes.js';
import { createSketchDraw, type SketchDraw } from './sketch-draw.js';
import { createSketchPlanes, type PlaneName, type SketchPlanes } from './sketch-planes.js';
import { addStudioLights } from './studio-lights.js';
import { type ProjectionCamera, worldPerPixel } from './world-per-pixel.js';

/** Shown sketches select nothing; one empty set and not a new one per draw. */
const NO_SKETCH_IDS: ReadonlySet<SketchId> = new Set();

/** The six orthographic directions, plus the default three-quarter view. */
export type ViewName = 'default' | 'front' | 'back' | 'top' | 'bottom' | 'right' | 'left';

/** A side of the orientation cube. */
export type CubeSide = Exclude<ViewName, 'default'>;

const VIEW_DIRECTIONS: Record<ViewName, readonly [number, number, number]> = {
  default: [120, -160, 110],
  front: [0, -1, 0],
  back: [0, 1, 0],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  // Slightly off vertical: looking exactly along the +Z up vector is singular for `lookAt`. The
  // tilt toward −Y puts world +Y at the top of the screen.
  top: [0, -0.001, 1],
  bottom: [0, -0.001, -1],
};

/** Above this, the extra pixels cost more than they show on a 5K display. */
const MAX_PIXEL_RATIO = 2;

/**
 * How far a parallel view may turn before it becomes perspective: three degrees, as a cosine.
 * 1.5° is within accidental nudges and damping; 8° shows a visible slant.
 */
const ORTHO_LOCK_COS = Math.cos((3 * Math.PI) / 180);

/** Camera distance from the origin when there is nothing to frame (a new or empty document). */
const DEFAULT_STANDOFF = 240;

/** Frames of timing history kept, always on, so ADR 0007 budgets can be checked. */
const FRAME_HISTORY = 240;

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  pixelRatio?: number;
}

const scratchBox = new Box3();
/** Kept apart from `scratchBox`, which a fit is often part-way through using. */
const clipBox = new Box3();
const clipSphere = new Sphere();
const scratchVec = new Vector3();
const scratchSpherical = new Spherical();

/**
 * Rotations between the Z-up world and the Y-up frame `Spherical` uses (+90° about X sends +Z to
 * +Y), keeping the horizon level while the cube is dragged.
 */
const Z_UP_TO_Y_UP = new Matrix4().makeRotationX(-Math.PI / 2);
const Y_UP_TO_Z_UP = new Matrix4().makeRotationX(Math.PI / 2);

export class ViewportScene {
  readonly scene = new Scene();
  /** Where the model goes; lights and helpers stay outside. `fit()` measures only this group. */
  readonly content = new Group();
  readonly controls: OrbitControls;
  readonly #renderer: WebGLRenderer;
  /** A camera move in progress, or null. Advanced by the render loop. */
  #glide: Glide | null = null;
  /** The key light, re-aimed from the camera every frame. */
  readonly #key: DirectionalLight;
  readonly #background = new Color();
  readonly #rig = new CameraRig();

  /**
   * The direction a parallel view was squared onto, or null. Turning away ends the parallel view
   * (`#dropOrthoIfTurned`).
   */
  #orthoLock: Vector3 | null = null;

  /** Whichever camera is drawing. A getter, since it changes with the projection. */
  get camera(): ActiveCamera {
    return this.#rig.active;
  }

  /** Whether the view is currently a true parallel projection. */
  get isOrthographic(): boolean {
    return this.#rig.isOrthographic;
  }

  #frame = 0;
  /** How hard drawing is for this machine right now (frame-budget.ts). */
  readonly budget = new FrameBudget();
  /** The view's own work that can wait for a still camera (background-work.ts). */
  readonly background = new BackgroundWork();
  #beforeDraw: ((now: number) => void) | null = null;
  #idle: ((now: number) => void) | null = null;
  /** The view drawn more cheaply while the camera moves, as cheaply as the budget needs. */
  readonly quality: InteractionQuality;
  /** The view as cloth while a file is dragged over it (fabric.ts). */
  readonly #fabric = new FabricWarp();
  #cssWidth = 1;
  #cssHeight = 1;
  #disposed = false;
  /** When to draw (redraw.ts). */
  readonly #redraw: Redraw;
  readonly #helpers: Helpers;
  readonly #sketchPlanes: SketchPlanes;
  readonly #sketchDraw: SketchDraw;
  readonly #navigation: NavigationInput;
  /** One overlay per sketch on show outside sketch mode, grown as needed. */
  readonly #shownDraws: SketchDraw[] = [];
  readonly #references = new ReferenceMeshes();
  /** One plane, reused. Section view toggles it in and out of the renderer. */
  readonly #section = new Plane(new Vector3(0, 0, -1), 0);

  /** Ring of recent render durations, in milliseconds. */
  readonly #frameTimes = new Float32Array(FRAME_HISTORY);
  #frameCursor = 0;
  #framesSeen = 0;

  constructor({ canvas, pixelRatio }: SceneOptions) {
    // `alpha` for transparent screenshots; `stencil` for section caps (section-caps.ts).
    this.#renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, stencil: true });
    const ratio = Math.min(pixelRatio ?? devicePixelRatio, MAX_PIXEL_RATIO);
    this.#renderer.setPixelRatio(ratio);
    this.quality = new InteractionQuality(this.#renderer, ratio, this.budget);
    if (pixelRatio === undefined)
      this.quality.followDisplay(MAX_PIXEL_RATIO, () => this.#redraw.invalidate());

    // The rig sets up both cameras, including Z-up, which `frameBounds` must share.
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.addEventListener('start', this.#interruptGlide);
    canvas.addEventListener('wheel', this.#interruptGlide, { capture: true, passive: true });
    // All navigation tuning lives in navigation.ts.
    this.#navigation = installNavigation(this.controls);

    // Two lights, no shadows (frame budget, ADR 0007). The key light follows the camera
    // (`aimKeyLight`) so the faces turned toward the viewer are always lit.
    this.#key = new DirectionalLight(0xffffff, 1.9);
    this.scene.add(this.#key);
    addStudioLights(this.scene);
    this.scene.add(new AmbientLight(0xffffff, 0.22));
    // Hemisphere light: up and down faces differ, which the camera-bound key light cannot give.
    this.scene.add(new HemisphereLight(0xf2f6ff, 0x30333b, 0.9));

    this.scene.add(this.content);

    this.#helpers = createHelpers();
    this.scene.add(this.#helpers.grid);
    this.scene.add(this.#helpers.axes);

    this.#sketchPlanes = createSketchPlanes();
    this.scene.add(this.#sketchPlanes.group);

    this.#sketchDraw = createSketchDraw(true);
    this.scene.add(this.#sketchDraw.group);
    this.scene.add(this.#references.group);

    // Off by default, which would silently ignore the section plane.
    this.#renderer.localClippingEnabled = true;

    this.#redraw = new Redraw(canvas);

    this.#loop();
  }

  /** The shown model's triangle count, exposed as `data-triangles` for tests and benchmarks. */
  setTriangleCount(count: number): void {
    this.mark('triangles', String(count));
  }

  /** A `data-` attribute on the canvas, as `data-triangles`; null removes it. */
  mark(name: string, value: string | null): void {
    if (value === null) delete this.#renderer.domElement.dataset[name];
    else this.#renderer.domElement.dataset[name] = value;
  }

  /** The picture is out of date: draw it again on the next frame. */
  invalidate(): void {
    this.#redraw.invalidate();
  }

  /** `beforeDraw` runs as each frame is about to be drawn; `idle` on each frame that is not. */
  setFrameHooks(beforeDraw: (now: number) => void, idle: (now: number) => void): void {
    this.#beforeDraw = beforeDraw;
    this.#idle = idle;
  }

  /** Something on show moves by itself, and while this says so every frame is drawn. */
  setAnimating(animating: () => boolean): void {
    this.#redraw.setAnimating(animating);
  }

  /** Keep the WebGL clear and grid in the same theme as the surrounding shell. */
  setAppearance(background: string, gridMinor: string, gridMajor: string): void {
    this.#background.setStyle(background);
    this.#renderer.setClearColor(this.#background, 1);
    this.#helpers.setColours(gridMinor, gridMajor, background);
  }

  /** Matches the drawing buffer to the element. `false` keeps Three.js from styling the canvas. */
  /** A file is held over the view here, in CSS pixels; null when it has gone. */
  pressFabric(point: { x: number; y: number } | null): void {
    if (point === null) this.#fabric.release();
    else this.#fabric.press(point.x, point.y);
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.#cssWidth = width;
    this.#cssHeight = height;
    // Update both projections, or a resize would stretch the orthographic view.
    this.#rig.setAspect(width / height, this.#viewingDistance());
    this.#renderer.setSize(width, height, false);
    // Resizing clears the buffer; draw now so a dragged window does not flash blank.
    this.#renderer.render(this.scene, this.camera);
  }

  /** How far the camera stands from what it is looking at. Sizes the parallel box. */
  /**
   * World size of one screen pixel at the middle of the view: exact for orthographic, at the orbit
   * centre's plane for perspective.
   */
  #worldPerPixel(): number {
    const size = new Vector2();
    this.#renderer.getSize(size);
    const camera = this.camera;
    const projection: ProjectionCamera =
      'isOrthographicCamera' in camera && camera.isOrthographicCamera === true
        ? { isOrthographicCamera: true, top: camera.top, bottom: camera.bottom, zoom: camera.zoom }
        : { fov: this.#rig.fov };
    return worldPerPixel(projection, this.#viewingDistance(), size.y);
  }

  #viewingDistance(): number {
    return this.camera.position.distanceTo(this.controls.target) || 1;
  }

  /** Frame everything in the scene, or `box` (the parts picked). The arithmetic: `framing.ts`. */
  fit(box?: Bounds): void {
    this.#settleControls();
    scratchBox.makeEmpty();
    if (box === undefined) scratchBox.expandByObject(this.content);
    else scratchBox.set(scratchBox.min.copy(box.min), scratchBox.max.copy(box.max));
    // An empty scene frames the origin at the default standoff, so the camera is never stranded.
    if (scratchBox.isEmpty()) {
      this.controls.target.set(0, 0, 0);
      const direction = this.camera.position.clone().sub(this.controls.target);
      if (direction.lengthSq() === 0) direction.set(120, -160, 110);
      direction.setLength(DEFAULT_STANDOFF);
      this.camera.position.copy(direction);
      this.camera.near = 0.1;
      this.camera.far = 10_000;
      this.camera.updateProjectionMatrix();
      this.#refitFrustum();
      this.controls.update();
      return;
    }

    this.#frameBox(scratchBox.min, scratchBox.max);
  }

  /** Bring a box into view from the direction the camera already looks from. */
  #frameBox(
    min: { x: number; y: number; z: number },
    max: { x: number; y: number; z: number },
  ): void {
    // Framed through the lens in both modes, then the parallel box is sized to that distance, so
    // both projections frame alike.
    const framing = frameBounds(
      min,
      max,
      this.#rig.fov,
      this.#rig.aspect,
      {
        x: this.camera.position.x - this.controls.target.x,
        y: this.camera.position.y - this.controls.target.y,
        z: this.camera.position.z - this.controls.target.z,
      },
      this.camera.up,
    );

    this.controls.target.set(framing.target.x, framing.target.y, framing.target.z);
    this.camera.position.set(framing.position.x, framing.position.y, framing.position.z);
    this.camera.near = framing.near;
    this.camera.far = framing.far;
    this.camera.updateProjectionMatrix();
    this.#refitFrustum();
    this.controls.update();
  }

  /**
   * Re-derives the parallel box after the camera moved; a no-op under perspective. Every camera
   * reposition must call it, since a parallel view zooms only through its frustum.
   */
  #refitFrustum(): void {
    if (!this.#rig.isOrthographic) return;
    this.#rig.orthographic.zoom = 1;
    this.#rig.matchFrustum(this.#viewingDistance());
  }

  /**
   * Keeps the near and far planes around what the camera can see, derived from the viewing
   * distance (so it works for an empty document) and reaching past the ground's fade.
   */
  #clipToView(): void {
    const distance = this.#viewingDistance();

    // The model's own extent, so close up to a large part the rest is not clipped. Cheap: bounding
    // boxes are cached per geometry.
    clipBox.makeEmpty();
    clipBox.expandByObject(this.content);
    let modelFar = 0;
    if (!clipBox.isEmpty()) {
      clipBox.getBoundingSphere(clipSphere);
      modelFar = this.camera.position.distanceTo(clipSphere.center) + clipSphere.radius;
    }

    // Scaling with distance keeps the near/far ratio, and so depth precision, roughly constant.
    const near = Math.max(distance * 0.01, 1e-5);
    const far = Math.max(gridReach(distance) * 1.5, modelFar * 1.15, distance * 4);
    if (this.camera.near === near && this.camera.far === far) return;
    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Flushes pending damped motion before the camera is placed, or it would slide the camera off
   * afterwards (up to 14% of the viewport after one drag). One `update()` with damping off applies
   * the remainder and clears the accumulators.
   */
  #settleControls(): void {
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = damping;
  }

  /**
   * Recent frame work times, oldest first, in milliseconds. Work, not interval, since the interval
   * is pinned to the refresh rate and says nothing about the 8 ms budget (ADR 0007).
   */
  frameTimes(): readonly number[] {
    const count = Math.min(this.#framesSeen, FRAME_HISTORY);
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      // Walk from the oldest entry still in the ring.
      const at = (this.#frameCursor - count + i + FRAME_HISTORY) % FRAME_HISTORY;
      out.push(this.#frameTimes[at] ?? 0);
    }
    return out;
  }

  /** Forget the history, so a measurement is not polluted by what came before. */
  resetFrameTimes(): void {
    this.#framesSeen = 0;
    this.#frameCursor = 0;
  }

  /** The centre of everything the model occupies (`content-measure.ts`), or null for nothing. */
  contentCenter(): { x: number; y: number; z: number } | null {
    return contentCenter(this.content);
  }

  /** Show or hide the ground grid. */
  setGridVisible(visible: boolean): void {
    this.#helpers.grid.visible = visible;
  }

  /** The grid and axes, for the plane they lie on. */
  get helpers(): Helpers {
    return this.#helpers;
  }
  /** Show or hide the world axes through the origin. */
  setAxesVisible(visible: boolean): void {
    this.#helpers.axes.visible = visible;
  }

  /**
   * Field of view, in degrees. The lens angle and, because the parallel box is derived from it, the
   * amount of world an orthographic view takes in as well, so it stays meaningful in both modes and
   * does not go dead when the view squares up to an axis.
   */
  setFieldOfView(degrees: number): void {
    this.#rig.setFieldOfView(degrees, this.#viewingDistance(), this.controls.target);
    this.controls.update();
  }

  /** A true parallel projection that stays when the view is turned, or the lens (audit F-036). */
  setParallel(on: boolean): void {
    this.#rig.parallelAlways = on;
    this.setOrthographic(on);
  }

  /**
   * Switches between perspective and parallel projection. `orbit` drops back to perspective first,
   * so the view cube always works.
   */
  setOrthographic(on: boolean): void {
    if (!this.#rig.setOrthographic(on, this.controls.target)) return;
    this.controls.object = this.camera;
    this.controls.update();
    if (!on) this.#orthoLock = null;
  }

  /** Records the direction a parallel view was squared onto; call after placing the camera. */
  #lockOrtho(): void {
    if (!this.#rig.isOrthographic) {
      this.#orthoLock = null;
      return;
    }
    const lock = this.#orthoLock ?? new Vector3();
    this.#orthoLock = lock.copy(this.camera.position).sub(this.controls.target).normalize();
  }

  /**
   * Switches back to perspective, keeping the pose, once a parallel view is turned off its axis.
   * Rotation stays enabled so the usual drag leaves a squared-up view.
   */
  #dropOrthoIfTurned(): void {
    const lock = this.#orthoLock;
    if (lock === null || this.#rig.parallelAlways) return;
    // Not during a glide: its first frames are at the old direction with the new axis already
    // locked, which would read as turning away.
    if (this.#glide !== null) return;
    scratchVec.copy(this.camera.position).sub(this.controls.target);
    if (scratchVec.lengthSq() === 0) return;
    if (scratchVec.normalize().dot(lock) < ORTHO_LOCK_COS) this.setOrthographic(false);
  }

  /** Cuts the model at a height along +Z; `null` removes the plane so no clip test runs. */
  setSection(at: number | null): void {
    if (at === null) {
      this.#renderer.clippingPlanes = [];
      return;
    }
    this.#section.constant = at;
    this.#renderer.clippingPlanes = [this.#section];
  }

  /** The camera's orientation for the view cube's CSS `matrix3d` (`CameraRig.cubeMatrix`). */
  viewCubeMatrix(): readonly number[] {
    return CameraRig.cubeMatrix(this.camera);
  }

  /**
   * Orbits the camera by angles in radians around the target, for dragging the view cube. Moves the
   * camera directly; the controls pick up the position on their next update.
   */
  orbit(deltaAzimuth: number, deltaPolar: number): void {
    this.#interruptGlide();
    // A free turn drops back to perspective first.
    this.setOrthographic(false);
    this.#turn(deltaAzimuth, deltaPolar);
  }

  #interruptGlide = (): void => {
    if (this.#glide === null) return;
    // User navigation cancels the glide.
    this.#glide = null;
    this.#rig.perspective.updateProjectionMatrix();
    this.#orthoLock = null;
    this.invalidate();
  };

  /**
   * A quarter turn about the up axis that keeps a parallel view parallel (the view cube arrows).
   * Re-locks afterwards so the drift watcher does not read it as leaving the view.
   */
  spin(deltaAzimuth: number, animate = false): void {
    const fromParallel = this.#rig.isOrthographic;
    const fromPosition = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    const fromZoom = this.#rig.isOrthographic ? this.#rig.orthographic.zoom : 1;
    this.#turn(deltaAzimuth, 0);
    this.#lockOrtho();
    if (animate) this.#glideFrom(fromPosition, fromTarget, fromZoom, fromParallel);
  }

  /**
   * Glides from the given pose to where the camera already is. Animated moves place the camera
   * first and then rewind, so animated and instant arrivals are identical.
   */
  #glideFrom(fromPosition: Vector3, fromTarget: Vector3, fromZoom = 1, fromParallel = false): void {
    // The projection morphs during the flight rather than switching on arrival.
    const parallel = this.#rig.isOrthographic;
    if (parallel) this.setOrthographic(false);
    const plan = planGlide(
      { position: fromPosition, target: fromTarget, zoom: fromZoom },
      { position: this.camera.position, target: this.controls.target },
      parallel,
      performance.now(),
      fromParallel !== parallel,
    );
    if (typeof plan === 'string') {
      this.#glide = null;
      if (parallel) this.setOrthographic(true);
      if (plan === 'still') this.#lockOrtho();
      return;
    }
    this.camera.position.copy(fromTarget).addScaledVector(plan.fromDirection, plan.fromDistance);
    this.controls.target.copy(fromTarget);
    this.controls.update();
    this.#glide = { ...plan, startParallel: fromParallel };
  }

  #turn(deltaAzimuth: number, deltaPolar: number): void {
    scratchVec.copy(this.camera.position).sub(this.controls.target);
    // Rotate into Y-up for `Spherical`, orbit, and rotate back, keeping the horizon level.
    scratchVec.applyMatrix4(Z_UP_TO_Y_UP);
    scratchSpherical.setFromVector3(scratchVec);
    scratchSpherical.theta -= deltaAzimuth;
    scratchSpherical.phi = Math.max(
      1e-3,
      Math.min(Math.PI - 1e-3, scratchSpherical.phi + deltaPolar),
    );
    scratchVec.setFromSpherical(scratchSpherical).applyMatrix4(Y_UP_TO_Z_UP);
    this.camera.position.copy(this.controls.target).add(scratchVec);
    this.controls.update();
  }

  /**
   * Squares up to a named view, keeping the fit, jumping or gliding (`#glideFrom`). The six axis
   * views are parallel; the three-quarter view keeps perspective.
   */
  setView(view: ViewName, animate = false): void {
    const fromParallel = this.#rig.isOrthographic;
    const fromPosition = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    const fromZoom = this.#rig.isOrthographic ? this.#rig.orthographic.zoom : 1;
    this.#placeView(view);
    if (!animate) {
      this.#glide = null;
      return;
    }
    this.#glideFrom(fromPosition, fromTarget, fromZoom, fromParallel);
  }

  /**
   * Looks straight at `target` along `normal`. Given the face's box, frames the face, never the
   * whole model.
   */
  squareOn(
    normal: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number },
    animate = false,
    bounds: { min: [number, number, number]; max: [number, number, number] } | null = null,
  ): void {
    const length = Math.hypot(normal.x, normal.y, normal.z);
    if (length === 0) return;
    // Faces pointing straight up or down use the Top/Bottom direction, slightly off the pole
    // toward -Y, since looking exactly along Z has no defined screen up.
    if (Math.hypot(normal.x, normal.y) < length * 1e-4) {
      normal = { x: 0, y: -0.001 * length, z: normal.z };
    }
    const fromParallel = this.#rig.isOrthographic;
    const fromPosition = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    const fromZoom = this.#rig.isOrthographic ? this.#rig.orthographic.zoom : 1;
    this.#settleControls();
    this.#rig.uprightCamera(this.controls);
    const distance = this.#viewingDistance();
    // Parallel only for cube directions (face, edge, corner); otherwise the grid would slant.
    this.setOrthographic(onTheCube(normal, length));
    this.controls.target.set(target.x, target.y, target.z);
    this.camera.position
      .copy(this.controls.target)
      .add(new Vector3(normal.x, normal.y, normal.z).multiplyScalar(distance / length));
    this.controls.update();
    // With the face's own box, the face fills the view; without one the zoom stays as it was.
    if (bounds !== null) {
      const boxed = withAir(bounds);
      this.#frameBox(boxed.min, boxed.max);
    }
    this.#lockOrtho();
    if (animate) this.#glideFrom(fromPosition, fromTarget, fromZoom, fromParallel);
    else this.#glide = null;
    this.invalidate();
  }

  /** Advance a glide, or do nothing when none is running. */
  #advanceGlide(): void {
    const glide = this.#glide;
    if (glide === null) return;
    const arrived = glidePose(glide, performance.now(), this.controls.target, this.camera.position);
    this.controls.update();
    if (!arrived) return;
    this.#glide = null;
    if (glide.parallel) this.setOrthographic(true);
    // The pose the lock describes is only reached now.
    this.#lockOrtho();
  }

  /** Looks from a cube edge (two sides) or corner (three), in parallel like the six sides. */
  setViewBetween(sides: readonly CubeSide[], animate = false): void {
    const fromParallel = this.#rig.isOrthographic;
    const [only] = sides;
    if (sides.length === 1 && only !== undefined) {
      this.setView(only, animate);
      return;
    }
    const fromPosition = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    const fromZoom = this.#rig.isOrthographic ? this.#rig.orthographic.zoom : 1;
    let x = 0;
    let y = 0;
    let z = 0;
    for (const side of sides) {
      const [sx, sy, sz] = VIEW_DIRECTIONS[side];
      const length = Math.hypot(sx, sy, sz) || 1;
      x += sx / length;
      y += sy / length;
      z += sz / length;
    }
    // Parallel like the axis views: every place on the cube is a parallel view.
    this.#placeDirection([x, y, z], true);
    if (!animate) {
      this.#glide = null;
      return;
    }
    this.#glideFrom(fromPosition, fromTarget, fromZoom, fromParallel);
  }

  /**
   * Whether the model covers the middle of the view, which is where the user is working. An empty
   * scene counts, so it is still framed on the origin.
   */
  #modelUnderCentre(): boolean {
    clipBox.makeEmpty();
    clipBox.expandByObject(this.content);
    if (clipBox.isEmpty()) return true;
    this.camera.updateMatrixWorld();
    const { min, max } = clipBox;
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.POSITIVE_INFINITY;
    let top = Number.NEGATIVE_INFINITY;
    for (let corner = 0; corner < 8; corner++) {
      scratchVec
        .set(corner & 1 ? max.x : min.x, corner & 2 ? max.y : min.y, corner & 4 ? max.z : min.z)
        .project(this.camera);
      left = Math.min(left, scratchVec.x);
      right = Math.max(right, scratchVec.x);
      bottom = Math.min(bottom, scratchVec.y);
      top = Math.max(top, scratchVec.y);
    }
    return left <= 0 && right >= 0 && bottom <= 0 && top >= 0;
  }

  #placeView(view: ViewName): void {
    this.#placeDirection(VIEW_DIRECTIONS[view], view !== 'default');
  }

  #placeDirection(direction: readonly [number, number, number], parallel: boolean): void {
    const [x, y, z] = direction;
    // Before reading the distance, which a coasting zoom would otherwise change.
    this.#settleControls();
    this.#rig.uprightCamera(this.controls);
    const distance = this.#viewingDistance();
    // Switch first so the position is written to the camera about to draw.
    this.setOrthographic(parallel);
    const length = Math.hypot(x, y, z) || 1;
    this.camera.position
      .copy(this.controls.target)
      .add(new Vector3((x / length) * distance, (y / length) * distance, (z / length) * distance));
    this.controls.update();
    // Frames the model only when the user is looking at it; over empty ground the view is taken
    // there, not at a model off to one side.
    if (this.#modelUnderCentre()) this.fit();
    // After the camera has landed, so the lock records the axis it settled on.
    this.#lockOrtho();
  }

  /** The current frame as a PNG, rendered on demand since the drawing buffer is not preserved. */
  capture(options: { scale?: number; transparent?: boolean } = {}): Promise<Blob | null> {
    // Resizing for the shot clears the drawing buffer; the view is drawn again.
    return capture(this.#renderer, this.scene, this.camera, options, () =>
      this.#redraw.invalidate(),
    );
  }

  /** Show or hide the datum planes used to choose where a sketch lives. */
  setSketchPlanesVisible(visible: boolean): void {
    this.#sketchPlanes.setVisible(visible);
  }

  /** Reveal the other half of one world axis, or none. */
  setHoveredAxis(axis: number | null): void {
    this.#helpers.setHoveredAxis(axis);
  }

  /** Where the surface is under the cursor: zooming pivots on it (navigation.ts `zoomPivot`). */
  setSurfaceProbe(probe: SurfaceProbe | null): void {
    this.#navigation.setProbe(probe);
    this.#navigation.setReach(probe === null ? null : () => this.#reach.get());
  }

  readonly #reach = new ContentReach(this.content);

  /** Re-applies navigation settings after the user changed them. */
  setNavigation(prefs: NavigationPrefs): void {
    this.#navigation.set(prefs);
  }
  onScrollDevice(listener: Parameters<NavigationInput['onDetect']>[0]): void {
    this.#navigation.onDetect(listener);
  }

  /** Whether a press belongs to navigation under the current mapping, not to selection. */
  navigationClaims(event: {
    button: number;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  }): boolean {
    return this.#navigation.claims(event);
  }

  setSketchPlaneHovered(plane: PlaneName | null): void {
    this.#sketchPlanes.setHovered(plane);
  }

  /** Which datum plane a pixel is over, or null. */
  pickSketchPlane(ndcX: number, ndcY: number): PlaneName | null {
    return this.#sketchPlanes.pick(this.camera, ndcX, ndcY);
  }

  /** What the sketch overlay draws. See `sketch-draw.ts`. */
  get sketchDraw(): SketchDraw {
    return this.#sketchDraw;
  }

  /** Draws these sketches, each on its own plane, beside the one being drawn. */
  setShownSketches(
    sketches: readonly { plane: PlaneBasis; sketch: Sketch; unfilled: ReadonlySet<string> }[],
  ): void {
    while (this.#shownDraws.length < sketches.length) {
      const draw = createSketchDraw();
      this.scene.add(draw.group);
      this.#shownDraws.push(draw);
    }
    this.#shownDraws.forEach((draw, index) => {
      const item = sketches[index];
      if (item === undefined) draw.set(null, null, [], NO_SKETCH_IDS);
      else draw.set(item.plane, item.sketch, [], NO_SKETCH_IDS, item.unfilled);
    });
  }

  /** Imported meshes, drawn for reference and never picked. */
  setReferenceMeshes(meshes: readonly ReferenceMesh[]): void {
    this.#references.set(meshes);
  }

  dispose(): void {
    this.#disposed = true;
    this.quality.dispose();
    this.#redraw.dispose();
    this.#references.dispose();
    cancelAnimationFrame(this.#frame);
    this.#helpers.dispose();
    this.#sketchPlanes.dispose();
    this.#sketchDraw.dispose();
    this.#navigation.dispose();
    this.background.clear();
    for (const draw of this.#shownDraws) draw.dispose();
    this.controls.dispose();
    this.#renderer.domElement.removeEventListener('wheel', this.#interruptGlide, { capture: true });
    this.#fabric.dispose();
    this.#renderer.dispose();
  }

  #loop = (): void => {
    if (this.#disposed) return;
    this.#frame = requestAnimationFrame(this.#loop);

    const started = performance.now();
    this.#redraw.looped(started);
    // Every frame, not on input: damping keeps the camera moving after the pointer stops.
    this.controls.update();
    // Before the ortho check, so a glide is judged on where it landed.
    this.#advanceGlide();
    // Sketch line weights are in pixels, so the overlay needs the current pixel size.
    if (this.sketchDraw.group.visible) this.sketchDraw.setScale(this.#worldPerPixel());
    for (const draw of this.#shownDraws) {
      if (draw.group.visible) draw.setScale(this.#worldPerPixel());
    }
    // Right after the controls move the camera, so leaving an axis is handled the same frame.
    this.#dropOrthoIfTurned();
    // After the camera moved, or the ground lags a frame behind the model while orbiting.
    this.#clipToView();
    aimKeyLight(this.#key, this.camera, this.controls.target);
    this.#helpers.update(this.camera, this.controls.target);
    if (this.#glide !== null) {
      const t = Math.min(1, (started - this.#glide.startedAt) / GLIDE_MS);
      const eased = 1 - (1 - Math.max(0, t)) ** 3;
      const start = this.#glide.startParallel === true ? 1 : 0;
      this.#rig.morphToOrthographic(
        start + ((this.#glide.parallel ? 1 : 0) - start) * eased,
        this.#viewingDistance(),
      );
      this.#redraw.invalidate();
    }
    // Rendering normally updates the camera's world matrix, but this frame may not draw; motion
    // detection needs it current.
    this.camera.updateMatrixWorld();
    if (!this.#redraw.due(this.quality.frame(this.camera, started), this.#fabric.active, started)) {
      this.budget.skipped(started);
      this.#idle?.(started);
      // Background work only with the camera still and time to spare, a slice a frame.
      if (!this.quality.moving && this.budget.spare && this.background.pending) {
        this.background.run(performance.now() + SLICE_MS);
      }
      return;
    }
    this.budget.drawn(started);
    this.#beforeDraw?.(started);
    if (
      !this.#fabric.render(this.#renderer, this.scene, this.camera, this.#cssWidth, this.#cssHeight)
    ) {
      this.#renderer.render(this.scene, this.camera);
    }

    this.#frameTimes[this.#frameCursor] = performance.now() - started;
    this.#frameCursor = (this.#frameCursor + 1) % FRAME_HISTORY;
    this.#framesSeen++;
  };
}
