/**
 * Section caps via the stencil buffer: back faces count up, front faces down, and a plane drawn
 * where the count is non-zero fills the cut. Hatched in screen space so spacing is constant at any
 * distance.
 */

import {
  AlwaysStencilFunc,
  BackSide,
  type BufferGeometry,
  Color,
  DecrementWrapStencilOp,
  FrontSide,
  Group,
  IncrementWrapStencilOp,
  Mesh,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  PlaneGeometry,
  ReplaceStencilOp,
  ShaderMaterial,
} from 'three';

/** Distance between hatch lines, in CSS pixels. */
const HATCH_SPACING = 9;

function counter(side: typeof FrontSide | typeof BackSide): MeshBasicMaterial {
  const op = side === BackSide ? IncrementWrapStencilOp : DecrementWrapStencilOp;
  return new MeshBasicMaterial({
    side,
    // Counts every surface along the ray, hidden or not: only the parity at the plane matters, so
    // nothing is written but the stencil.
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    stencilWrite: true,
    stencilFunc: AlwaysStencilFunc,
    stencilFail: op,
    stencilZFail: op,
    stencilZPass: op,
  });
}

export class SectionCaps {
  readonly object = new Group();
  readonly #back = new Mesh(undefined, counter(BackSide));
  readonly #front = new Mesh(undefined, counter(FrontSide));
  readonly #fill = { value: new Color('#c9cdd3') };
  readonly #line = { value: new Color('#8a9099') };
  readonly #spacing = { value: HATCH_SPACING * 2 };
  readonly #material = new ShaderMaterial({
    // Not clipped by the section plane it lies in.
    clipping: false,
    uniforms: { fill: this.#fill, line: this.#line, spacing: this.#spacing },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 fill;
      uniform vec3 line;
      uniform float spacing;
      void main() {
        float d = mod(gl_FragCoord.x + gl_FragCoord.y, spacing);
        float width = max(1.0, spacing * 0.1);
        float ink = 1.0 - smoothstep(width - 0.5, width + 0.5, d);
        gl_FragColor = vec4(mix(fill, line, ink), 1.0);
        // The colours are held linear, as three.js keeps them; shown as sRGB.
        #include <colorspace_fragment>
      }
    `,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: NotEqualStencilFunc,
    // Drawn once per pixel: the stencil is reset where the cap is drawn.
    stencilFail: ReplaceStencilOp,
    stencilZFail: ReplaceStencilOp,
    stencilZPass: ReplaceStencilOp,
  });
  readonly #cap = new Mesh(new PlaneGeometry(1, 1), this.#material);

  constructor() {
    this.#back.renderOrder = 1;
    this.#front.renderOrder = 1;
    this.#cap.renderOrder = 2;
    // Whatever the counters left elsewhere must not leak into the next frame.
    this.#cap.onBeforeRender = (renderer) => {
      this.#spacing.value = HATCH_SPACING * renderer.getPixelRatio();
    };
    this.#cap.onAfterRender = (renderer) => renderer.clearStencil();
    this.object.add(this.#back, this.#front, this.#cap);
    this.object.visible = false;
  }

  /**
   * Close the cut of `geometry` at height `at`, or show nothing. The body's own geometry is
   * borrowed and never disposed here.
   */
  set(geometry: BufferGeometry | null, at: number | null, shown: boolean): void {
    if (geometry === null || at === null || !shown) {
      this.object.visible = false;
      return;
    }
    this.#back.geometry = geometry;
    this.#front.geometry = geometry;
    if (geometry.boundingBox === null) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box === null) {
      this.object.visible = false;
      return;
    }
    // Wider than the body by a margin, so its whole cut is under the plane.
    const width = Math.max(box.max.x - box.min.x, 1) * 1.2;
    const depth = Math.max(box.max.y - box.min.y, 1) * 1.2;
    this.#cap.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, at);
    this.#cap.scale.set(width, depth, 1);
    this.object.visible = true;
  }

  /** The cut's colours, to sit with the theme around it. */
  setColours(fill: string, line: string): void {
    this.#fill.value.setStyle(fill);
    this.#line.value.setStyle(line);
  }

  dispose(): void {
    this.#cap.geometry.dispose();
    this.#material.dispose();
    (this.#back.material as MeshBasicMaterial).dispose();
    (this.#front.material as MeshBasicMaterial).dispose();
  }
}
