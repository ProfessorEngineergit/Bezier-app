/**
 * The presentation renderer: PBR materials, image-based studio light, soft shadows, bloom, depth of
 * field and decals. Separate from the modelling viewport so that view never pays for the WebGPU
 * post-processing pipeline, and with its own camera so composing a render never moves it.
 */

import type { BodySummary } from '@bezier/core';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { outline } from 'three/addons/tsl/display/OutlineNode.js';
import { clamp, emissive, luminance, max, mix, mrt, output, pass, uniform, vec4 } from 'three/tsl';
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Euler,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RenderPipeline,
  Scene,
  Vector2,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import { watchPixelDensity } from './pixel-density.js';
import {
  type BodyAppearance,
  boundsOfPositions,
  PresentationBodies,
} from './presentation-bodies.js';
import { type DecalPlacement, PresentationDecals } from './presentation-decals.js';
import type { EmissionSettings } from './presentation-emission.js';
import { PresentationEnvironment } from './presentation-environment.js';
import type { FaceAppearance } from './presentation-face-materials.js';
import type { FaceLook } from './presentation-faces.js';
import type { PresentationMaterialSurface } from './presentation-material.js';
import type { DisplayGeometry } from './viewport-api.js';

export interface PresentationSettings extends EmissionSettings {
  color: string;
  roughness: number;
  metalness: number;
  transmission: number;
  clearcoat: number;
  /** Exposure in photographic stops around 0. */
  exposure: number;
  fov: number;
  bloom: number;
  /** Bokeh strength; 0 switches depth of field off entirely. */
  dof: number;
  /** Focus distance as a multiple of the distance to the orbit target. */
  focus: number;
  background: string;
  /** No backdrop at all: the canvas, and a capture of it, keep an alpha channel. */
  transparent: boolean;
  ground: boolean;
  groundColor: string;
  /** Strength of the image-based studio light. */
  environment: number;
  /** Strength of the key light that casts the shadow. */
  light: number;
  /** Where the key light stands around the model, in degrees. */
  lightAngle: number;
  turntable: boolean;
  /** Seconds for one turntable revolution. */
  duration: number;
  /** Size of a photographed material pattern relative to its preset. */
  textureScale: number;
  /** Strength of normal-map and procedural microstructure. */
  grain: number;
  textureRotation?: number;
  anisotropy?: number;
  anisotropyRotation?: number;
  ior?: number;
}

type Picture = ReturnType<ReturnType<typeof pass>['getTextureNode']>;
type Edge = ReturnType<typeof vec4>;
/** How many frames are drawn after a change, see `#pending`. */
const FRAMES_AFTER_CHANGE = 4;

/**
 * The picture with glow and the picked bodies' outline on top. Glow colour is added but its alpha
 * is its brightness, not added, so a transparent capture is not veiled (audit F-057). The outline
 * goes around the body, leaving its material colour untouched (audit F-058).
 */
function withGlow(picture: Picture, glow: ReturnType<typeof bloom>, edge: Edge) {
  // Mixed, not added: tone mapping would turn an added cyan outline white.
  const rgb = mix(picture.rgb.add(glow.rgb), edge.rgb, edge.a);
  return vec4(rgb, max(max(picture.a, clamp(luminance(glow.rgb), 0, 1)), edge.a));
}

export class PresentationRenderer {
  readonly renderer: WebGPURenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(38, 1, 0.01, 100000);
  readonly controls: OrbitControls;
  readonly pipeline: RenderPipeline;
  readonly scenePass;
  readonly bloomNode;
  readonly focusNode = uniform(100);
  readonly bokehNode = uniform(0);
  readonly focalNode = uniform(35);
  readonly dofNode;
  #dofEnabled = false;
  readonly environment: PresentationEnvironment;
  readonly ground: Mesh<PlaneGeometry, MeshPhysicalMaterial>;
  readonly light = new DirectionalLight(0xffffff, 4);
  readonly bodies: PresentationBodies;
  readonly outlineNode;
  readonly #edgeColour = uniform(new Color('#2ec4ff'));
  readonly #edgeStrength = uniform(1);
  readonly #edge: Edge;
  readonly #decals = new PresentationDecals(this.scene, () => this.#touch());
  #bodiesShown: Promise<void> = Promise.resolve();
  #ray = new Raycaster();
  #pointer = new Vector2();
  #target = new Vector3();
  #size = 1;
  #lightAngle = -45;
  #last = 0;
  #disposed = false;
  #unwatchDensity: () => void;
  #onLost: (() => void) | null = null;

  static async create(canvas: HTMLCanvasElement): Promise<PresentationRenderer> {
    // Alpha so a transparent backdrop really is transparent in a capture.
    const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true });
    try {
      await renderer.init();
      return new PresentationRenderer(canvas, renderer);
    } catch (error) {
      renderer.dispose();
      throw error;
    }
  }

  private constructor(canvas: HTMLCanvasElement, renderer: WebGPURenderer) {
    this.renderer = renderer;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.#unwatchDensity = watchPixelDensity((next) => {
      this.renderer.setPixelRatio(Math.min(next, 2));
      this.#touch();
    });
    // Three's WebGPURenderer (WebGPU and WebGL2 fallback) never draws again after device or context
    // loss, even once restored. The owner is told so it can start a new renderer.
    const report = this.renderer.onDeviceLost.bind(this.renderer);
    this.renderer.onDeviceLost = (info) => {
      report(info);
      if (!this.#disposed) this.#onLost?.();
    };
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.environment = new PresentationEnvironment(this.renderer);
    this.scene.environment = this.environment.fallback;
    this.scene.background = new Color('#22252a');
    this.ground = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshPhysicalMaterial({ color: '#55585f', roughness: 0.85 }),
    );
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.radius = 4;
    // Prevents shadow acne, worst near-tangent to the light. `normalBias` is world-space and scales
    // with the part in `setGeometry`; `bias` is in normalised shadow-map depth, so a constant
    // works.
    this.light.shadow.bias = -0.0015;
    this.scene.add(this.light);
    this.scene.add(this.light.target);
    this.bodies = new PresentationBodies(this.scene);
    this.scenePass = pass(this.scene, this.camera);
    this.scenePass.setMRT(mrt({ output, emissive }));
    const color = this.scenePass.getTextureNode('output');
    this.bloomNode = bloom(this.scenePass.getTextureNode('emissive'), 0.12, 0.5, 0.85);
    this.dofNode = dof(
      color,
      this.scenePass.getViewZNode(),
      this.focusNode,
      this.focalNode,
      this.bokehNode,
    );
    this.outlineNode = outline(this.scene, this.camera, {
      selectedObjects: [],
      edgeThickness: uniform(1.5),
    });
    // Behind other things it is fainter, so a body tucked behind another still shows where it is.
    const { visibleEdge, hiddenEdge } = this.outlineNode;
    const edge = clamp(visibleEdge.mul(3).add(hiddenEdge), 0, 1).mul(this.#edgeStrength);
    this.#edge = vec4(this.#edgeColour, edge);
    this.pipeline = new RenderPipeline(this.renderer, withGlow(color, this.bloomNode, this.#edge));
    this.renderer.setAnimationLoop((time) => {
      // A hidden workspace keeps its renderer but stops spending frames on it.
      if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
        this.#last = 0;
        return;
      }
      const dt = this.#last ? Math.min((time - this.#last) / 1000, 0.1) : 0;
      this.#last = time;
      // Damping by time, not by frame, so low frame rates settle as fast as 60 Hz (audit B7): the
      // controls' 0.05 at 60 Hz, scaled to the frame's length.
      this.controls.dampingFactor = 1 - 0.95 ** (dt * 60);
      const moved = this.controls.update(dt);
      // Draw only on change (or while turning or moving): without a GPU a frame takes most of a
      // second.
      if (!moved && !this.controls.autoRotate && this.#pending === 0) return;
      if (this.#pending > 0) this.#pending -= 1;
      this.pipeline.render();
    });
    this.controls.addEventListener('change', this.#touch);
  }

  /**
   * Frames still to draw. Several, since glow and depth of field read the previous frame and a new
   * texture shows a frame late.
   */
  #pending = FRAMES_AFTER_CHANGE;

  /** Something on show changed: draw again. */
  readonly #touch = () => {
    this.#pending = FRAMES_AFTER_CHANGE;
  };

  /** Told when the device or context is lost; this renderer draws nothing from then on. */
  onLost(listener: (() => void) | null): void {
    this.#onLost = listener;
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.#touch();
  }

  /** Switch the image-based light while keeping a procedural room as fallback. */
  setEnvironment(url: string | null): Promise<void> {
    this.#touch();
    return this.environment.set(this.scene, url).finally(this.#touch);
  }

  /** Material assignment is keyed by stable body provenance and survives geometry rebuilds. */
  async setBodyAppearances(appearances: readonly BodyAppearance[]): Promise<void> {
    this.#touch();
    await this.bodies.apply(appearances).finally(this.#touch);
  }

  /**
   * All faces with their own material; the rest use their body's
   * (`presentation-face-materials.ts`).
   */
  async setFaceAppearances(appearances: readonly FaceAppearance[]): Promise<void> {
    this.#touch();
    await this.bodies.applyFaces(appearances).finally(this.#touch);
  }

  /** Compatibility for a single-body consumer. Studio assigns explicit body keys instead. */
  setMaterialSurface(surface: PresentationMaterialSurface | null): Promise<void> {
    return Promise.all(
      [...this.bodies.entries.values()].map((e) => e.maps.set(e.material, surface)),
    ).then(this.#touch);
  }

  setGeometry(display: DisplayGeometry | null, bodies: readonly BodySummary[] = []) {
    this.clearDecals();
    this.#touch();
    // Bodies arrive in slices (`PresentationBodies.setGeometry`); framing uses the display's
    // positions instead of waiting.
    this.#bodiesShown = this.bodies.setGeometry(display, bodies, this.#touch);
    if (!display) return;
    const box = boundsOfPositions(display.mesh.positions);
    if (box.isEmpty()) return;
    box.getCenter(this.#target);
    this.#size = Math.max(box.getSize(new Vector3()).length(), 1e-3);
    // The ground reaches beyond the camera's far plane: no plate edge can enter the view.
    this.ground.scale.setScalar(this.#size * 2000);
    this.camera.near = this.#size * 0.01;
    this.camera.far = this.#size * 100;
    this.camera.updateProjectionMatrix();
    this.ground.position.set(this.#target.x, this.#target.y, box.min.z - this.#size * 0.003);
    Object.assign(this.light.shadow.camera, {
      left: -this.#size * 2,
      right: this.#size * 2,
      top: this.#size * 2,
      bottom: -this.#size * 2,
      // Scaled to the part: a fixed 0.01 near plane put a 400 mm part's far plane 40,000x away,
      // exhausting shadow-map depth precision.
      near: this.#size * 0.01,
      far: this.#size * 10,
    });
    this.light.shadow.camera.updateProjectionMatrix();
    // World-space, so it tracks the part; see `shadow.bias` in the constructor.
    this.light.shadow.normalBias = this.#size * 0.005;
    this.#placeLight();
    this.frame();
  }

  /** Put the camera back on the classic three-quarter view of the model. */
  frame() {
    const size = this.#size;
    this.controls.target.copy(this.#target);
    this.camera.position.copy(this.#target).add(new Vector3(size, -size * 1.5, size * 0.8));
    this.controls.update();
  }

  #placeLight() {
    const a = (this.#lightAngle * Math.PI) / 180;
    const reach = this.#size * 1.6;
    this.light.position
      .copy(this.#target)
      .add(new Vector3(Math.cos(a) * reach, Math.sin(a) * reach, this.#size * 3));
    this.light.target.position.copy(this.#target);
  }

  update(s: PresentationSettings) {
    this.#touch();
    this.renderer.toneMappingExposure = 2 ** s.exposure;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.bloomNode.strength.value = s.bloom;
    // The node's scale suits a lens a few millimetres wide; at 1 the blur is barely visible on
    // ordinary parts (audit B7).
    this.bokehNode.value = s.dof * 5;
    this.focusNode.value = this.camera.position.distanceTo(this.controls.target) * s.focus;
    this.focalNode.value = 35;
    if (this.#dofEnabled !== s.dof > 0) {
      this.#dofEnabled = s.dof > 0;
      // The depth-of-field node is a texture node at run time; its declared type is narrower than
      // what `add` accepts.
      const scene = this.scenePass.getTextureNode('output');
      const source = this.#dofEnabled ? (this.dofNode as unknown as typeof scene) : scene;
      this.pipeline.outputNode = withGlow(source, this.bloomNode, this.#edge);
      this.pipeline.needsUpdate = true;
    }
    this.scene.background = s.transparent ? null : new Color(s.background);
    this.ground.visible = s.ground && !s.transparent;
    this.ground.material.color.set(s.groundColor);
    this.scene.environmentIntensity = s.environment;
    this.light.intensity = s.light;
    if (this.#lightAngle !== s.lightAngle) {
      this.#lightAngle = s.lightAngle;
      this.#placeLight();
    }
    // The turntable is the orbit controls' auto-rotate, so the view can still be zoomed, tilted and
    // panned while it turns (audit B7). One orbit takes `duration` seconds.
    this.controls.autoRotate = s.turntable;
    this.controls.autoRotateSpeed = 60 / Math.max(1, s.duration);
    this.controls.enabled = true;
  }

  /**
   * Focuses on the surface under a canvas point (0 to 1 each way). Returns the focus as a multiple
   * of the target distance (`PresentationSettings.focus`), or null on a miss.
   */
  focusAt(x: number, y: number): number | null {
    const body = this.bodies.group;
    if (body.children.length === 0) return null;
    this.#pointer.set(x * 2 - 1, 1 - y * 2);
    this.#ray.setFromCamera(this.#pointer, this.camera);
    const hit = this.#ray.intersectObject(body, true)[0];
    if (hit === undefined) return null;
    const reference = this.camera.position.distanceTo(this.controls.target);
    return reference > 0 ? hit.distance / reference : null;
  }

  /** The face under a canvas point (0 to 1 each way) and the body it is part of, or null. */
  pickFace(x: number, y: number): { body: string; face: string } | null {
    this.#pointer.set(x * 2 - 1, 1 - y * 2);
    this.#ray.setFromCamera(this.#pointer, this.camera);
    const hit = this.#ray.intersectObject(this.bodies.group, true)[0];
    const body = hit?.object.userData.bodyKey;
    if (hit === undefined || typeof body !== 'string' || hit.faceIndex == null) return null;
    const face = this.bodies.faceAt(body, hit.faceIndex);
    return face === null ? null : { body, face };
  }

  /** Colours of single faces, and the one pointed at and the ones picked, drawn on the model. */
  setFaces(look: FaceLook) {
    this.bodies.faces.paint(look);
    this.#touch();
  }

  /** The one colour for everything picked (audit D12), as a CSS colour. */
  setSelectionColour(colour: string) {
    this.bodies.faces.setAccent(colour);
    this.#edgeColour.value.set(colour);
    this.#touch();
  }

  /** Draw an outline round these bodies, by key; none for an empty list. */
  setOutlined(keys: readonly string[]) {
    this.outlineNode.selectedObjects = keys.flatMap((key) => {
      const entry = this.bodies.entries.get(key);
      return entry === undefined ? [] : [entry.mesh];
    });
    this.#touch();
  }

  pickBody(x: number, y: number): string | null {
    this.#pointer.set(x * 2 - 1, 1 - y * 2);
    this.#ray.setFromCamera(this.#pointer, this.camera);
    const hit = this.#ray.intersectObject(this.bodies.group, true)[0];
    return typeof hit?.object.userData.bodyKey === 'string' ? hit.object.userData.bodyKey : null;
  }

  /** The current frame as a PNG, with alpha when the backdrop is transparent. */
  capture(): Promise<Blob | null> {
    // Rendered and read in the same task so the canvas still holds this frame; without the outline.
    const strength = this.#edgeStrength.value;
    this.#edgeStrength.value = 0;
    this.pipeline.render();
    this.#edgeStrength.value = strength;
    const canvas = this.renderer.domElement;
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  async addDecal(file: File, x: number, y: number, size: number) {
    const group = this.bodies.group;
    if (group.children.length === 0) throw new Error('Create a solid before placing a decal.');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 15_000_000)
      throw new Error('Use a PNG, JPEG or WebP under 15 MB.');
    this.#pointer.set(x * 2 - 1, 1 - y * 2);
    this.#ray.setFromCamera(this.#pointer, this.camera);
    const hit = this.#ray.intersectObject(group, true)[0];
    if (!hit?.face || !(hit.object instanceof Mesh))
      throw new Error('Drop the decal directly on the model.');
    const body = hit.object;
    const normal = hit.face.normal.clone().transformDirection(body.matrixWorld);
    const direction = new Mesh();
    direction.lookAt(normal);
    const orientation = new Euler().setFromQuaternion(direction.quaternion);
    await this.#decals.place(
      {
        file,
        body: String(body.userData.bodyKey ?? ''),
        point: [hit.point.x, hit.point.y, hit.point.z],
        orientation: [orientation.x, orientation.y, orientation.z],
        size,
      },
      body,
      () => !this.#disposed && body.parent === this.bodies.group,
    );
  }

  get decalCount(): number {
    return this.#decals.count;
  }

  /** Where every decal sits, to put them back on a renderer started afresh. */
  get decalPlacements(): readonly DecalPlacement[] {
    return this.#decals.placements;
  }

  /**
   * Restores decals once the bodies are shown. Returns how many failed (body gone or image failed
   * to load).
   */
  async restoreDecals(placements: readonly DecalPlacement[]): Promise<number> {
    await this.#bodiesShown;
    let missed = 0;
    for (const placement of placements) {
      const body = this.bodies.entries.get(placement.body)?.mesh;
      if (body === undefined) {
        missed++;
        continue;
      }
      try {
        await this.#decals.place(placement, body, () => !this.#disposed && body.parent !== null);
      } catch {
        missed++;
      }
    }
    return missed;
  }

  clearDecals() {
    this.#decals.clear();
  }

  dispose() {
    this.#disposed = true;
    this.#onLost = null;
    this.#unwatchDensity();
    this.renderer.setAnimationLoop(null);
    this.controls.removeEventListener('change', this.#touch);
    this.clearDecals();
    this.controls.dispose();
    this.bodies.dispose();
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.environment.dispose();
    this.light.shadow.dispose();
    this.scenePass.dispose();
    this.bloomNode.dispose();
    this.dofNode.dispose();
    this.outlineNode.dispose();
    this.pipeline.dispose();
    this.renderer.dispose();
  }
}
