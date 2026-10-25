/**
 * Nib's three.js stage: scene, model, rig and animation clock. One stage is one WebGL context.
 * `tick` runs every animation frame and skips frames it does not need to draw (`pacing.ts`).
 * `NibView` owns the stage's lifetime.
 */

import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  CanvasTexture,
  DirectionalLight,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  Scene,
  type Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { isSoftwareRenderer, rendererName } from './capability.js';
import { type Channel, Values } from './channels.js';
import type { Actor } from './controller.js';
import { type HeadMood, MOODS } from './head-mood.js';
import { Idle } from './idle.js';
import { applyFinish, ENVIRONMENT, flattenGlass } from './look.js';
import { Mouth } from './mouth.js';
import { drawInterval } from './pacing.js';
import { Pointing } from './pointing.js';
import type { ReactionName } from './reaction-data.js';
import { Reactions } from './reactions.js';
import { NibRig } from './rig.js';
import { stepSprings } from './springs.js';

/** Draw every frame for this long after pointer movement, so following it is smooth. */
const FRESH_FOR = 0.7;
/** Maximum time step, so a tab resuming after a long pause does not jolt the springs. */
const LONGEST_STEP = 0.05;

/**
 * Framing: full figure on a page (`full`), full figure small in a round window with room for arms
 * and feet (`whole`), or head and shoulders filling a round window (`head`).
 */
export type Frame = 'full' | 'head' | 'whole';

/** User-chosen colours (CSS hex) for the shell and the eye light. */
export interface NibLook {
  body?: string;
  eyes?: string;
}

export class NibStage implements Actor {
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(24, 1, 0.05, 5);
  readonly #rig: NibRig;
  readonly #mouth: Mouth;
  readonly #root: Object3D;
  readonly #env: Texture;
  readonly #ground: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly #size = new Vector3();
  readonly #centre = new Vector3();
  readonly #value = new Values();
  readonly #velocity = new Values();
  readonly #target = new Values();
  readonly #idle = new Idle();
  readonly #reactions = new Reactions();
  readonly #pointing = new Pointing();
  readonly #raycaster = new Raycaster();
  readonly #point = new Vector2();
  readonly #led: MeshStandardMaterial | null;
  readonly #eyes: MeshStandardMaterial | null;
  /** Materials recoloured by `setLook`, matched by name without Blender's `.001` suffix. */
  readonly #shells: MeshStandardMaterial[] = [];
  readonly #eyeLights: MeshStandardMaterial[] = [];
  #original: { body: number; eyes: number } | null = null;
  readonly #eyeGlow: number;
  #frame: Frame = 'full';
  #mood: HeadMood = 'rest';
  #last: number | null = null;
  #drawn = -Infinity;
  #lastInput = -Infinity;

  private constructor(renderer: WebGLRenderer, root: Object3D, env: Texture) {
    this.#renderer = renderer;
    this.#root = root;
    this.#env = env;
    this.#scene.add(root);
    this.#scene.environment = env;
    this.#scene.environmentIntensity = ENVIRONMENT;
    const key = new DirectionalLight(0xffffff, 0.9);
    key.position.set(-0.6, 1.2, 1.4);
    const fill = new DirectionalLight(0xdde6ff, 0.35);
    fill.position.set(0.9, 0.2, 1);
    this.#scene.add(key, fill, new AmbientLight(0xffffff, 0.35));
    this.#rig = new NibRig(root);
    const mouthParent = this.#rig.node('Mund') ?? root;
    this.#mouth = new Mouth(mouthParent);
    flattenGlass(root);
    const materials = new Map<string, Material>();
    root.traverse((node) => {
      if (node instanceof Mesh && !Array.isArray(node.material)) {
        node.frustumCulled = false;
        materials.set(node.material.name, node.material);
      }
    });
    applyFinish(materials);
    const standard = (name: string): MeshStandardMaterial | null => {
      const m = materials.get(name);
      return m instanceof MeshStandardMaterial ? m : null;
    };
    this.#led = standard('Anzeige gedimmt');
    this.#eyes = standard('Augenlicht');
    for (const material of materials.values()) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      const base = material.name.replace(/\.\d+$/, '');
      if (base === 'Schale weiß') this.#shells.push(material);
      if (base === 'Augenlicht') this.#eyeLights.push(material);
    }
    this.#eyeGlow = this.#eyes?.emissiveIntensity ?? 1;
    // The lens is glass over the eye light: no depth write, so it does not hide it.
    const lens = materials.get('Linse vergütet');
    if (lens !== undefined) lens.depthWrite = false;
    this.#ground = makeShadow();
    this.#scene.add(this.#ground);
    this.#value.toRest();
    this.#target.toRest();
    this.#measure();
  }

  /**
   * Creates the stage and loads the model. Returns null without WebGL or on a software renderer
   * (Nib then stays a static image). Throws only when the model cannot be loaded.
   */
  static async create(
    canvas: HTMLCanvasElement,
    modelUrl: string,
    frame: Frame = 'full',
  ): Promise<NibStage | null> {
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      });
    } catch {
      return null;
    }
    // Lets browser tests without a GPU render him anyway.
    const forced = (globalThis as { __nibSoftware?: boolean }).__nibSoftware === true;
    if (!forced && isSoftwareRenderer(rendererName(renderer.getContext()))) {
      renderer.dispose();
      renderer.forceContextLoss();
      return null;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = ACESFilmicToneMapping;
    try {
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(modelUrl);
      // A 64 px environment is enough for lacquer and metal and keeps first-load cost low.
      const pmrem = new PMREMGenerator(renderer);
      const env = pmrem.fromScene(new RoomEnvironment(), 0.05, 0.1, 100, { size: 64 }).texture;
      pmrem.dispose();
      shortenNeck(gltf.scene);
      const stage = new NibStage(renderer, gltf.scene, env);
      stage.setFrame(frame);
      // Compile shaders asynchronously; the first plain render would block for ~0.7 s.
      await renderer.compileAsync(stage.#scene, stage.#camera);
      return stage;
    } catch (error) {
      renderer.dispose();
      renderer.forceContextLoss();
      throw error;
    }
  }

  #measure(): void {
    const box = new Box3().setFromObject(this.#root);
    box.getSize(this.#size);
    box.getCenter(this.#centre);
    this.#fit();
  }

  /** Moves the camera back until Nib fits both dimensions (with room for the arms and pencil). */
  #fit(): void {
    const half = Math.tan((this.#camera.fov * Math.PI) / 360);
    if (this.#frame === 'head') {
      this.#fitHead(half);
      return;
    }
    if (this.#frame === 'whole') {
      const c = this.#centre;
      const distance = (this.#size.y * 0.6) / Math.min(half, half * this.#camera.aspect);
      this.#camera.position.set(c.x, c.y + this.#size.y * 0.03, c.z + distance);
      this.#camera.lookAt(c.x, c.y + this.#size.y * 0.02, c.z);
      this.#camera.updateProjectionMatrix();
      return;
    }
    const vertical = (this.#size.y * 0.62) / half;
    const horizontal = (this.#size.x * 0.62) / (half * this.#camera.aspect);
    const distance = Math.max(vertical, horizontal);
    const c = this.#centre;
    this.#camera.position.set(c.x, c.y + this.#size.y * 0.04, c.z + distance);
    this.#camera.lookAt(c.x, c.y + this.#size.y * 0.03, c.z);
    this.#camera.updateProjectionMatrix();
  }

  /**
   * Frames head, neck, shoulders and the top fifth of the body in a round window (head and neck
   * alone look cut off at the chin). Seen from slightly above; the pencil is left out of the
   * bounds.
   */
  #fitHead(half: number): void {
    const head = this.#rig.node('Kopf');
    if (head === null) return;
    // Bounds of the head shell and ears in the rest pose.
    this.#root.updateMatrixWorld(true);
    const box = new Box3();
    head.traverse((node) => {
      if (!(node instanceof Mesh) || node.name.startsWith('Stift')) return;
      for (let up = node.parent; up !== null; up = up.parent)
        if (up.name.startsWith('Stift')) return;
      box.expandByObject(node);
    });
    // Extend down to a fifth of the body, as wide as the shoulders.
    const body = this.#rig.node('Rumpfschale');
    if (body !== null) {
      const shell = new Box3().setFromObject(body);
      for (const side of ['Schulterkugel L', 'Schulterkugel R']) {
        const shoulder = this.#rig.node(side);
        if (shoulder !== null) shell.union(new Box3().setFromObject(shoulder));
      }
      const height = shell.max.y - shell.min.y;
      box.union(
        new Box3(
          new Vector3(shell.min.x, shell.max.y - height * 0.2, shell.min.z),
          new Vector3(shell.max.x, shell.max.y, shell.max.z),
        ),
      );
    }
    const size = box.getSize(new Vector3());
    const middle = box.getCenter(new Vector3());
    const reach = Math.max(size.x, size.y);
    const distance = (reach * 0.56) / Math.min(half, half * this.#camera.aspect);
    this.#camera.position.set(middle.x, middle.y + reach * 0.05, middle.z + distance);
    this.#camera.lookAt(middle.x, middle.y, middle.z);
    this.#camera.updateProjectionMatrix();
  }

  /** Switches the framing. */
  setFrame(frame: Frame): void {
    if (frame === this.#frame) return;
    this.#frame = frame;
    this.#ground.visible = frame !== 'head';
    this.#fit();
    this.#drawn = -Infinity;
  }

  /** Sets the colours; an absent one restores the model's original. */
  setLook(look: NibLook): void {
    this.#original ??= {
      body: this.#shells[0]?.color.getHex() ?? 0xffffff,
      eyes: this.#eyeLights[0]?.emissive.getHex() ?? 0xffffff,
    };
    const { body, eyes } = this.#original;
    for (const shell of this.#shells) shell.color.set(look.body ?? body);
    for (const light of this.#eyeLights) light.emissive.set(look.eyes ?? eyes);
    this.#drawn = -Infinity;
  }

  /** Base expression (the island's mood); reactions still play on top. */
  setMood(mood: HeadMood): void {
    this.#mood = mood;
    this.#drawn = -Infinity;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    if (width < 1 || height < 1) return;
    this.#renderer.setPixelRatio(pixelRatio);
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#fit();
    this.#drawn = -Infinity;
  }

  /** Makes Nib look towards screen point (x, y); `rect` is the canvas's rect. */
  pointerMove(x: number, y: number, rect: DOMRect, now: number): void {
    this.#touch(now);
    const dx = (x - (rect.left + rect.width * 0.5)) / Math.max(rect.width, 200);
    const dy = (y - (rect.top + rect.height * 0.3)) / Math.max(rect.height, 200);
    this.#idle.look(dx * 55, dy * 28, now);
  }

  pointerLeft(): void {
    this.#idle.lookAway();
  }

  #touch(now: number): void {
    this.#lastInput = now;
    if (this.#idle.touch(now)) this.#reactions.play('wake', now);
  }

  /** Names of the node at canvas point (x, y), 0 to 1 from top left, and its ancestors; or null. */
  pick(x: number, y: number): string[] | null {
    this.#point.set(x * 2 - 1, -(y * 2 - 1));
    this.#raycaster.setFromCamera(this.#point, this.#camera);
    const hit = this.#raycaster.intersectObject(this.#root, true)[0];
    if (hit === undefined) return null;
    const chain: string[] = [];
    for (let node: Object3D | null = hit.object; node !== null; node = node.parent)
      chain.push(node.name);
    return chain;
  }

  /** Plays a reaction requested by the page (not triggered by a click on him). */
  play(name: ReactionName, now: number): void {
    this.#reactions.play(name, now, true);
  }

  /** Points at `dx`, `dy` pixels from his shoulder (`dy` up) until `until`. */
  point(dx: number, dy: number, until: number): void {
    this.#pointing.at(dx, dy, until);
  }

  stopPointing(): void {
    this.#pointing.stop();
  }

  /** The canvas rect in page pixels. */
  box(): DOMRect {
    return this.#renderer.domElement.getBoundingClientRect();
  }

  /** A click on `chain` (see `pick`), or on nothing in particular for a key press. */
  click(chain: readonly string[], now: number): void {
    this.#touch(now);
    this.#reactions.click(chain, now);
  }

  /** Advances the animation. Returns whether a frame was drawn. */
  tick(now: number): boolean {
    const dt = Math.min(LONGEST_STEP, now - (this.#last ?? now));
    this.#last = now;
    const target = this.#target;
    target.toRest();
    this.#idle.update(now, dt, target);
    const aim = this.#pointing.apply(now, target);
    if (aim !== null) this.#idle.look(aim.turn, aim.nod, now);
    this.#reactions.apply(now, target);
    for (const [channel, offset] of Object.entries(MOODS[this.#mood])) {
      target.add(channel as Channel, offset);
    }
    stepSprings(this.#value, this.#velocity, target, dt);
    // The hop height is set directly; a spring would soften the landing.
    this.#value.set('posZ', this.#reactions.hop);
    this.#velocity.set('posZ', 0);
    const wait = drawInterval({
      reacting: this.#reactions.active,
      fresh: now - this.#lastInput < FRESH_FOR,
      blinking: this.#idle.blinking,
      gazing: this.#idle.gazing(now),
      asleep: this.#idle.sleep > 0.5,
    });
    if (now - this.#drawn < wait) return false;
    this.#drawn = now;
    this.#rig.apply(this.#value);
    this.#mouth.set(
      this.#value.get('smile'),
      this.#value.get('mouthWidth'),
      this.#value.get('mouthThick'),
    );
    if (this.#eyes !== null) this.#eyes.emissiveIntensity = this.#eyeGlow * this.#value.get('glow');
    if (this.#led !== null) this.#led.emissiveIntensity = 0.6 * (0.6 + 0.4 * Math.sin(now * 1.7));
    this.#renderer.render(this.#scene, this.#camera);
    return true;
  }

  dispose(): void {
    this.#mouth.dispose();
    this.#scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.geometry.dispose();
      for (const material of Array.isArray(node.material) ? node.material : [node.material])
        material.dispose();
    });
    this.#ground.geometry.dispose();
    this.#ground.material.map?.dispose();
    this.#ground.material.dispose();
    this.#env.dispose();
    this.#renderer.dispose();
    this.#renderer.forceContextLoss();
  }
}

/** A soft blob shadow under him: one textured quad, no shadow map. */
function makeShadow(): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g !== null) {
    const gradient = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(0,0,0,.55)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 64, 64);
  }
  const mesh = new Mesh(
    new PlaneGeometry(0.2, 0.2),
    new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.0005;
  return mesh;
}

/** Fraction of the visible neck between shoulders and head that is removed. */
const NECK_CUT = 0.6;

/**
 * Shortens the model's neck, which reads as a pole in small round windows: lowers the head and
 * scales the neck column and its cables to match. Runs before the rig records the rest pose.
 */
export function shortenNeck(root: Object3D, cut = NECK_CUT): void {
  const neck = root.getObjectByName('Nacken');
  const head = root.getObjectByName('Kopf');
  const shell = root.getObjectByName('Kopfschale');
  if (neck === undefined || head === undefined || shell === undefined) return;
  root.updateMatrixWorld(true);
  const bottom = new Box3().setFromObject(shell).min.y;
  const base = neck.getWorldPosition(new Vector3()).y;
  const scale = neck.getWorldScale(new Vector3()).y;
  const gap = (bottom - base) / scale;
  const lift = head.position.y;
  if (gap <= 0 || lift <= 0) return;
  const down = gap * cut;
  head.position.y = lift - down;
  const keep = (lift - down) / lift;
  for (const part of neck.children)
    if (part !== head && (part.name === 'Hals' || /^Leitung(\d*)$/.test(part.name)))
      part.scale.y *= keep;
  root.updateMatrixWorld(true);
}
