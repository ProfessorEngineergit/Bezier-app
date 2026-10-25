/**
 * A cloth effect while a file is dragged over the viewport: the scene is rendered to a texture on a
 * cloth grid that dips and ripples under the cursor, then springs flat and switches off.
 *
 * The cloth is 64 × 40 points simulated on the CPU (Verlet, springs to neighbours and to rest,
 * pinned border). Nothing allocates per frame (ADR 0007).
 */

import {
  BufferAttribute,
  type Camera,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  type Texture,
  Vector2,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

const COLS = 64;
const ROWS = 40;
const NODES = COLS * ROWS;

/** How far the fingertip reaches, as a share of the shorter side of the view. */
const REACH = 0.2;
/** How deep it presses at the centre, in pixels of apparent depth. */
const DEPTH = 60;
/** How far cloth is drawn in towards the fingertip at full press, in pixels. */
const GATHER = 12;
/** Share of the gap to rest closed each step. Firmer once released, so the cloth springs back. */
const HOME = 0.035;
const HOME_RELEASED = 0.09;
/** Velocity kept per step: below 1 so ripples die away instead of ringing. */
const KEEP = 0.86;
/** Neighbour-spring passes per frame. More is stiffer cloth. */
const PASSES = 3;
/** How quickly the press sinks in on contact, and lets go, per frame. */
const PRESS_IN = 0.085;
const PRESS_OUT = 0.13;
/** How closely the dip follows the cursor, per frame: less than 1 so it trails. */
const FOLLOW = 0.26;
/** How long a ripple runs, in milliseconds, and how fast it spreads (px/ms). */
const RIPPLE_MS = 900;
const RIPPLE_SPEED = 0.85;

const vertexShader = /* glsl */ `
  attribute float depth;
  attribute vec3 bend;
  varying vec2 vUv;
  varying float vDepth;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vDepth = depth;
    vNormal = bend;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D frame;
  uniform vec2 resolution;
  uniform vec2 press;
  uniform float strength;
  uniform float reach;
  uniform float ratio;
  // A ring spreading from the first touch, and one from letting go:
  // origin in buffer pixels, then age in milliseconds (negative: none).
  uniform vec3 touchRipple;
  uniform vec3 releaseRipple;
  varying vec2 vUv;
  varying float vDepth;
  varying vec3 vNormal;
  float wave(vec3 ripple, vec2 at, out vec2 outward) {
    outward = vec2(0.0);
    if (ripple.z < 0.0 || ripple.z > ${RIPPLE_MS}.0) return 0.0;
    vec2 away = at - ripple.xy;
    float d = length(away);
    float radius = ripple.z * ${RIPPLE_SPEED} * ratio;
    float band = exp(-pow((d - radius) / (24.0 * ratio), 2.0));
    outward = d > 0.0 ? away / d : vec2(0.0);
    return band * (1.0 - ripple.z / ${RIPPLE_MS}.0);
  }

  void main() {
    // Round, and nothing but round: what is under the press is drawn in
    // towards it, the way cloth gathers into a fingertip. The rayed folds this
    // replaced read as a spiral round the file.
    vec2 away = gl_FragCoord.xy - press;
    float fall = strength * (1.0 - smoothstep(0.0, reach * 1.15, length(away)));
    // Per pixel, so it stays smooth: the cloth grid is 20 px a cell, and
    // gathering the picture with the grid bent the lines into corners.
    vec2 uv = vUv + away * fall * fall * 0.62 / resolution;
    vec2 outTouch;
    vec2 outRelease;
    float touch = wave(touchRipple, gl_FragCoord.xy, outTouch);
    float letGo = wave(releaseRipple, gl_FragCoord.xy, outRelease);
    uv += (outTouch * touch * 7.0 + outRelease * letGo * 5.0) * ratio / resolution;
    vec4 colour = texture2D(frame, uv);

    vec3 n = normalize(vNormal);
    // Light from the upper left, the way the rest of the interface is lit.
    vec3 light = normalize(vec3(-0.45, 0.6, 0.66));
    float diffuse = clamp(dot(n, light), 0.0, 1.0);
    // Relative to flat cloth, so an untouched area is exactly the frame.
    float shade = diffuse / clamp(light.z, 0.0, 1.0);
    vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
    float sheen = pow(clamp(dot(n, halfway), 0.0, 1.0), 24.0) * (1.0 - n.z) * 5.0;
    // Light only where the canvas has colour; light on clear areas shows as grey haze.
    // Highlights scale the colour rather than adding white, so a dark view
    // catches the light darkly instead of glowing.
    vec3 lit = colour.rgb * mix(1.0, shade, 0.35) * (1.0 + sheen * 0.22 + (touch + letGo) * 0.08);
    gl_FragColor = vec4(lit, colour.a);
    // The scene went into the texture untouched (linear, not tone-mapped);
    // finishing it here is what the renderer does for a frame drawn straight
    // to the screen. Without it the view under the cloth came out darker
    // than the same view without it.
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class FabricWarp {
  readonly #scene = new Scene();
  readonly #camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly #geometry = new PlaneGeometry(2, 2, COLS - 1, ROWS - 1);
  readonly #frame: { value: Texture | null } = { value: null };
  readonly #resolution = { value: new Vector2() };
  /** Where the press is, in drawing-buffer pixels from the bottom left. */
  readonly #pressAt = { value: new Vector2() };
  readonly #strength = { value: 0 };
  readonly #reach = { value: 1 };
  readonly #ratio = { value: 1 };
  readonly #touchRipple = { value: new Vector3(0, 0, -1) };
  readonly #releaseRipple = { value: new Vector3(0, 0, -1) };
  readonly #material = new ShaderMaterial({
    uniforms: {
      frame: this.#frame,
      resolution: this.#resolution,
      press: this.#pressAt,
      strength: this.#strength,
      reach: this.#reach,
      ratio: this.#ratio,
      touchRipple: this.#touchRipple,
      releaseRipple: this.#releaseRipple,
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  readonly #mesh = new Mesh(this.#geometry, this.#material);

  /** Cloth points, in pixels: where they are, where they were, where they rest. */
  readonly #at = new Float32Array(NODES * 3);
  readonly #was = new Float32Array(NODES * 3);
  readonly #rest = new Float32Array(NODES * 3);
  readonly #depth = new Float32Array(NODES);
  readonly #bend = new Float32Array(NODES * 3);
  readonly #size = new Vector2();

  #target: WebGLRenderTarget | null = null;
  #pointer: { x: number; y: number } | null = null;
  /** Where the dip is: following the cursor, a little behind it. */
  readonly #centre = { x: 0, y: 0 };
  /** How fast the dip is moving, smoothed, in pixels a frame. */
  #speed = 0;
  /** When the ripples started, in `performance.now()` time; -1 for none. */
  readonly #touch = { x: 0, y: 0, at: -1 };
  readonly #letGo = { x: 0, y: 0, at: -1 };
  #press = 0;
  #width = 0;
  #height = 0;

  constructor() {
    this.#geometry.setAttribute('depth', new BufferAttribute(this.#depth, 1));
    this.#geometry.setAttribute('bend', new BufferAttribute(this.#bend, 3));
    this.#mesh.frustumCulled = false;
    this.#scene.add(this.#mesh);
  }

  /** The file is over the view at this point, in CSS pixels from its top left. */
  press(x: number, y: number): void {
    if (this.#pointer === null) {
      this.#pointer = { x, y };
      // First contact: the dip starts where the file came in and a ring goes out from it.
      if (this.#press < 0.05) {
        this.#centre.x = x;
        this.#centre.y = y;
      }
      this.#touch.x = x;
      this.#touch.y = y;
      this.#touch.at = performance.now();
    }
    this.#pointer.x = x;
    this.#pointer.y = y;
  }

  /** The file has gone, dropped or taken away: let the cloth spring back. */
  release(): void {
    if (this.#pointer === null) return;
    this.#pointer = null;
    this.#letGo.x = this.#centre.x;
    this.#letGo.y = this.#centre.y;
    this.#letGo.at = performance.now();
  }

  /** True while there is anything to draw: pressed, settling, or rippling. */
  get active(): boolean {
    return (
      this.#pointer !== null ||
      this.#press > 0.001 ||
      this.#target !== null ||
      this.#rippling(performance.now())
    );
  }

  #rippling(now: number): boolean {
    return (
      (this.#touch.at >= 0 && now - this.#touch.at < RIPPLE_MS) ||
      (this.#letGo.at >= 0 && now - this.#letGo.at < RIPPLE_MS)
    );
  }

  /** Draws the frame through the cloth, or returns false to draw it plainly. */
  render(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    cssWidth: number,
    cssHeight: number,
  ): boolean {
    if (!this.active) return false;
    this.#fit(renderer, cssWidth, cssHeight);
    this.#step();

    const target = this.#target;
    if (target === null) return false;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    this.#frame.value = target.texture;
    // Buffer pixels count up from the bottom and include the device pixel ratio.
    const ratio = this.#size.x / Math.max(this.#width, 1);
    const now = performance.now();
    this.#pressAt.value.set(this.#centre.x * ratio, (this.#height - this.#centre.y) * ratio);
    this.#strength.value = this.#press;
    this.#reach.value = REACH * Math.min(this.#width, this.#height) * ratio;
    this.#ratio.value = ratio;
    for (const [ripple, uniform] of [
      [this.#touch, this.#touchRipple],
      [this.#letGo, this.#releaseRipple],
    ] as const) {
      const age = ripple.at < 0 ? -1 : now - ripple.at;
      uniform.value.set(ripple.x * ratio, (this.#height - ripple.y) * ratio, age);
    }
    renderer.render(this.#scene, this.#camera);

    // Settled flat with nothing pressing: free the texture and stop.
    if (
      this.#pointer === null &&
      this.#press <= 0.001 &&
      !this.#rippling(now) &&
      this.#stillness() < 0.05
    ) {
      this.#press = 0;
      target.dispose();
      this.#target = null;
    }
    return true;
  }

  dispose(): void {
    this.#target?.dispose();
    this.#target = null;
    this.#geometry.dispose();
    this.#material.dispose();
  }

  /** Size the texture and the cloth to the view, resetting the cloth on a change. */
  #fit(renderer: WebGLRenderer, width: number, height: number): void {
    renderer.getDrawingBufferSize(this.#size);
    if (this.#target === null) {
      this.#target = new WebGLRenderTarget(this.#size.x, this.#size.y, { samples: 4 });
    } else if (this.#target.width !== this.#size.x || this.#target.height !== this.#size.y) {
      this.#target.setSize(this.#size.x, this.#size.y);
    }
    this.#resolution.value.copy(this.#size);
    if (width === this.#width && height === this.#height) return;
    this.#width = width;
    this.#height = height;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const i = (row * COLS + col) * 3;
        const x = (col / (COLS - 1)) * width;
        const y = (row / (ROWS - 1)) * height;
        this.#rest[i] = x;
        this.#rest[i + 1] = y;
        this.#rest[i + 2] = 0;
        this.#at.set([x, y, 0], i);
        this.#was.set([x, y, 0], i);
      }
    }
  }

  #step(): void {
    const target = this.#pointer === null ? 0 : 1;
    this.#press += (target - this.#press) * (target > this.#press ? PRESS_IN : PRESS_OUT);
    // The dip trails the cursor and is shallower the faster it moves.
    if (this.#pointer !== null) {
      const stepX = (this.#pointer.x - this.#centre.x) * FOLLOW;
      const stepY = (this.#pointer.y - this.#centre.y) * FOLLOW;
      this.#centre.x += stepX;
      this.#centre.y += stepY;
      this.#speed = this.#speed * 0.8 + Math.hypot(stepX, stepY) * 0.2;
    } else {
      this.#speed *= 0.8;
    }
    const lift = 1 / (1 + this.#speed / 10);
    const home = this.#pointer === null ? HOME_RELEASED : HOME;
    const reach = REACH * Math.min(this.#width, this.#height);
    const px = this.#centre.x;
    const py = this.#centre.y;
    const at = this.#at;
    const was = this.#was;
    const rest = this.#rest;

    for (let row = 1; row < ROWS - 1; row++) {
      for (let col = 1; col < COLS - 1; col++) {
        const i = (row * COLS + col) * 3;
        for (let k = 0; k < 3; k++) {
          const now = at[i + k] ?? 0;
          const velocity = (now - (was[i + k] ?? 0)) * KEEP;
          was[i + k] = now;
          // Towards rest, so the cloth always finds its way back flat.
          at[i + k] = now + velocity + ((rest[i + k] ?? 0) - now) * home;
        }
        if (this.#press < 0.001) continue;
        // A smooth dip, deepest under the cursor, with surrounding cloth pulled in towards it.
        const dx = (rest[i] ?? 0) - px;
        const dy = (rest[i + 1] ?? 0) - py;
        const distance = Math.hypot(dx, dy);
        if (distance >= reach) continue;
        const fall = 1 - (distance / reach) ** 2;
        const weight = fall * fall * this.#press * lift;
        const wantZ = DEPTH * weight;
        if ((at[i + 2] ?? 0) < wantZ)
          at[i + 2] = (at[i + 2] ?? 0) + (wantZ - (at[i + 2] ?? 0)) * 0.5;
        // Fade the pull near the centre so cloth from both sides does not cross into a crease.
        const pull =
          ((GATHER * weight) / Math.max(distance, 1)) * Math.min(1, distance / (reach * 0.45));
        at[i] = (at[i] ?? 0) - dx * pull * 0.08;
        at[i + 1] = (at[i + 1] ?? 0) - dy * pull * 0.08;
      }
    }

    // Neighbour springs turn a press into folds and a moving press into ripples.
    for (let pass = 0; pass < PASSES; pass++) {
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          if (col + 1 < COLS) this.#spring(row * COLS + col, row * COLS + col + 1);
          if (row + 1 < ROWS) this.#spring(row * COLS + col, (row + 1) * COLS + col);
        }
      }
    }
    this.#upload();
  }

  /** Pull two neighbouring points back towards their resting distance. */
  #spring(a: number, b: number): void {
    const at = this.#at;
    const rest = this.#rest;
    const ia = a * 3;
    const ib = b * 3;
    const dx = (at[ib] ?? 0) - (at[ia] ?? 0);
    const dy = (at[ib + 1] ?? 0) - (at[ia + 1] ?? 0);
    const dz = (at[ib + 2] ?? 0) - (at[ia + 2] ?? 0);
    const length = Math.hypot(dx, dy, dz) || 1;
    const restLength = Math.hypot(
      (rest[ib] ?? 0) - (rest[ia] ?? 0),
      (rest[ib + 1] ?? 0) - (rest[ia + 1] ?? 0),
    );
    const correction = ((length - restLength) / length) * 0.5;
    // The border is pinned: the picture never pulls away from the window edge.
    const pinnedA = this.#pinned(a);
    const pinnedB = this.#pinned(b);
    if (pinnedA && pinnedB) return;
    const shareA = pinnedA ? 0 : pinnedB ? 1 : 0.5;
    const shareB = pinnedB ? 0 : pinnedA ? 1 : 0.5;
    at[ia] = (at[ia] ?? 0) + dx * correction * shareA * 2;
    at[ia + 1] = (at[ia + 1] ?? 0) + dy * correction * shareA * 2;
    at[ia + 2] = (at[ia + 2] ?? 0) + dz * correction * shareA * 2;
    at[ib] = (at[ib] ?? 0) - dx * correction * shareB * 2;
    at[ib + 1] = (at[ib + 1] ?? 0) - dy * correction * shareB * 2;
    at[ib + 2] = (at[ib + 2] ?? 0) - dz * correction * shareB * 2;
  }

  #pinned(node: number): boolean {
    const row = Math.floor(node / COLS);
    const col = node - row * COLS;
    return row === 0 || col === 0 || row === ROWS - 1 || col === COLS - 1;
  }

  /** How far the cloth still is from flat, in pixels at its worst point. */
  #stillness(): number {
    let worst = 0;
    for (let i = 0; i < NODES * 3; i++) {
      const gap = Math.abs((this.#at[i] ?? 0) - (this.#rest[i] ?? 0));
      if (gap > worst) worst = gap;
    }
    return worst;
  }

  /** Cloth points to the grid: screen position, depth, and the surface's normal. */
  #upload(): void {
    const position = this.#geometry.getAttribute('position') as BufferAttribute;
    const positions = position.array as Float32Array;
    const at = this.#at;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const node = row * COLS + col;
        const i = node * 3;
        // PlaneGeometry runs its rows from the top; so does the cloth.
        positions[i] = ((at[i] ?? 0) / this.#width) * 2 - 1;
        positions[i + 1] = 1 - ((at[i + 1] ?? 0) / this.#height) * 2;
        this.#depth[node] = at[i + 2] ?? 0;
        // The normal from the depth of the neighbours on either side.
        const left = (row * COLS + Math.max(col - 1, 0)) * 3 + 2;
        const right = (row * COLS + Math.min(col + 1, COLS - 1)) * 3 + 2;
        const up = (Math.max(row - 1, 0) * COLS + col) * 3 + 2;
        const down = (Math.min(row + 1, ROWS - 1) * COLS + col) * 3 + 2;
        const spanX = (2 * this.#width) / (COLS - 1);
        const spanY = (2 * this.#height) / (ROWS - 1);
        // Pressing in is away from the viewer, so depth counts against z.
        const nx = ((at[right] ?? 0) - (at[left] ?? 0)) / spanX;
        const ny = -((at[down] ?? 0) - (at[up] ?? 0)) / spanY;
        const length = Math.hypot(nx, ny, 1);
        this.#bend[i] = nx / length;
        this.#bend[i + 1] = ny / length;
        this.#bend[i + 2] = 1 / length;
      }
    }
    position.needsUpdate = true;
    (this.#geometry.getAttribute('depth') as BufferAttribute).needsUpdate = true;
    (this.#geometry.getAttribute('bend') as BufferAttribute).needsUpdate = true;
  }
}
