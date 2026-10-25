/**
 * Simulation results drawn on the body's tessellation: a scalar per vertex through a colour ramp,
 * optional contour bands with `fwidth` lines, and displacement in the vertex shader (animated by a
 * uniform). Values are pre-sampled at display vertices (`sampleField` in `@bezier/sim`).
 */

import type { Mesh } from '@bezier/kernel';
import {
  BufferAttribute,
  BufferGeometry,
  type Camera,
  DoubleSide,
  ShaderMaterial,
  Mesh as ThreeMesh,
} from 'three';

import { ResultProbe } from './result-probe.js';

export type ResultPalette = 'rainbow' | 'thermal' | 'safety' | 'density';

export interface ResultField {
  /** One value per display vertex. */
  values: Float32Array;
  /** Displacement per display vertex (xyz, mm), or null to draw undeformed. */
  displacement: Float32Array | null;
  min: number;
  max: number;
  /** 0 for a continuous ramp, otherwise the number of contour bands. */
  bands: number;
  palette: ResultPalette;
  /**
   * Values below this are cut away (removed material in optimisation results). Omit to draw all.
   */
  cutBelow?: number;
}

const PALETTE_ID: Record<ResultPalette, number> = { rainbow: 0, thermal: 1, safety: 2, density: 3 };

const vertexShader = /* glsl */ `
attribute float aValue;
attribute vec3 aDisplacement;
uniform float uDeform;
varying float vValue;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vValue = aValue;
  vec3 displaced = position + aDisplacement * uDeform;
  vec4 view = modelViewMatrix * vec4(displaced, 1.0);
  vView = -view.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * view;
}
`;

const fragmentShader = /* glsl */ `
uniform float uMin;
uniform float uMax;
uniform float uBands;
uniform float uCut;
uniform int uPalette;
varying float vValue;
varying vec3 vNormal;
varying vec3 vView;

// Blue through cyan, green and yellow to red: the ramp every structural
// analysis tool uses, so a reading needs no legend to be roughly right.
vec3 rainbow(float t) {
  vec3 a = vec3(0.10, 0.22, 0.85);
  vec3 b = vec3(0.00, 0.72, 0.95);
  vec3 c = vec3(0.18, 0.82, 0.32);
  vec3 d = vec3(0.98, 0.84, 0.10);
  vec3 e = vec3(0.92, 0.16, 0.12);
  float s = t * 4.0;
  if (s < 1.0) return mix(a, b, s);
  if (s < 2.0) return mix(b, c, s - 1.0);
  if (s < 3.0) return mix(c, d, s - 2.0);
  return mix(d, e, s - 3.0);
}

vec3 thermal(float t) {
  vec3 a = vec3(0.08, 0.04, 0.22);
  vec3 b = vec3(0.62, 0.10, 0.36);
  vec3 c = vec3(0.96, 0.44, 0.10);
  vec3 d = vec3(1.00, 0.93, 0.62);
  float s = t * 3.0;
  if (s < 1.0) return mix(a, b, s);
  if (s < 2.0) return mix(b, c, s - 1.0);
  return mix(c, d, s - 2.0);
}

// Safety factor reads the other way round: low is the warning.
vec3 safety(float t) {
  vec3 bad = vec3(0.90, 0.14, 0.12);
  vec3 marginal = vec3(0.98, 0.72, 0.10);
  vec3 good = vec3(0.16, 0.74, 0.38);
  vec3 ample = vec3(0.12, 0.46, 0.86);
  float s = t * 3.0;
  if (s < 1.0) return mix(bad, marginal, s);
  if (s < 2.0) return mix(marginal, good, s - 1.0);
  return mix(good, ample, s - 2.0);
}

vec3 density(float t) {
  return mix(vec3(0.30, 0.32, 0.36), vec3(0.86, 0.88, 0.90), t);
}

vec3 ramp(float t) {
  if (uPalette == 1) return thermal(t);
  if (uPalette == 2) return safety(t);
  if (uPalette == 3) return density(t);
  return rainbow(t);
}

void main() {
  if (vValue < uCut) discard;
  float t = clamp((vValue - uMin) / max(uMax - uMin, 1e-12), 0.0, 1.0);
  vec3 colour;
  if (uBands > 0.5) {
    float band = t * uBands;
    colour = ramp((min(floor(band), uBands - 1.0) + 0.5) / uBands);
    // A line at every band edge, one screen pixel wide at any zoom.
    float edge = abs(fract(band - 0.5) - 0.5);
    float line = 1.0 - smoothstep(0.0, fwidth(band) * 1.25, edge);
    colour = mix(colour, colour * 0.28, line * 0.85);
  } else {
    colour = ramp(t);
  }
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 light = normalize(vec3(0.35, 0.55, 0.75));
  // Lit enough to read as a solid, not so much that shading passes for a value.
  float shade = 0.62 + 0.38 * max(dot(n, light), 0.0);
  float rim = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 3.0) * 0.12;
  gl_FragColor = vec4(colour * shade + rim, 1.0);
}
`;

export class ResultOverlay {
  readonly object: ThreeMesh;
  readonly #geometry: BufferGeometry;
  readonly #material: ShaderMaterial;
  readonly #vertexCount: number;
  readonly #probe: ResultProbe;

  constructor(mesh: Mesh, field: ResultField) {
    this.#vertexCount = mesh.positions.length / 3;
    this.#probe = new ResultProbe(mesh, field);
    this.#geometry = new BufferGeometry();
    this.#geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
    this.#geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
    this.#geometry.setIndex(new BufferAttribute(mesh.indices, 1));
    this.#material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: DoubleSide,
      uniforms: {
        uMin: { value: 0 },
        uMax: { value: 1 },
        uBands: { value: 0 },
        uCut: { value: -Infinity },
        uPalette: { value: 0 },
        uDeform: { value: 1 },
      },
    });
    this.object = new ThreeMesh(this.#geometry, this.#material);
    this.object.renderOrder = 1;
    this.update(field);
  }

  /** Swap in a new field on the same tessellation. */
  update(field: ResultField): void {
    if (field.values.length !== this.#vertexCount) {
      throw new Error('ResultOverlay: one value per display vertex is required');
    }
    this.#probe.update(field);
    this.#geometry.setAttribute('aValue', new BufferAttribute(field.values, 1));
    const displacement =
      field.displacement !== null && field.displacement.length === this.#vertexCount * 3
        ? field.displacement
        : new Float32Array(this.#vertexCount * 3);
    this.#geometry.setAttribute('aDisplacement', new BufferAttribute(displacement, 3));
    const uniforms = this.#material.uniforms;
    (uniforms.uMin as { value: number }).value = field.min;
    (uniforms.uMax as { value: number }).value = field.max;
    (uniforms.uBands as { value: number }).value = field.bands;
    (uniforms.uCut as { value: number }).value = field.cutBelow ?? -Infinity;
    (uniforms.uPalette as { value: number }).value = PALETTE_ID[field.palette];
  }

  /** Scale the displacement field: 0 is undeformed, 1 is true scale. */
  setDeform(scale: number): void {
    (this.#material.uniforms.uDeform as { value: number }).value = scale;
  }

  sample(camera: Camera, x: number, y: number): number | null {
    return this.#probe.sample(
      camera,
      x,
      y,
      (this.#material.uniforms.uDeform as { value: number }).value,
    );
  }

  dispose(): void {
    this.#probe.dispose();
    this.#geometry.dispose();
    this.#material.dispose();
  }
}
