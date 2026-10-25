/**
 * The endless ground grid and world axes. The grid is one quad that follows the camera, with lines
 * computed in a fragment shader from the pattern coordinate; spacing comes from `grid-lod.ts`.
 * Nothing is allocated when the view changes.
 */

import type { PlaneBasis } from '@bezier/core';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  LineSegments,
  Matrix4,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import type { ActiveCamera } from './camera.js';
import { apparentDistance, foldOntoPattern, gridLevel, groundReach } from './grid-lod.js';

export type GridPlane = 'XY' | 'YZ' | 'XZ';

/**
 * Axis line length in millimetres (10 km), beyond the fade (thirty viewing distances, with the
 * camera up to 100 m away), so the ends are never seen.
 */
const AXIS_EXTENT = 10_000_000;

/** How much bigger than the fade radius the quad is cut, so its edge is never reached. */
const QUAD_MARGIN = 2.6;

export interface Helpers {
  grid: Mesh;
  axes: LineSegments;
  /**
   * The ground's colours. `background` must match the renderer's clear colour, since the grid
   * composites itself instead of blending.
   */
  setColours(minor: string, major: string, background: string): void;
  setGridPlane(plane: GridPlane): void;
  /**
   * Lays the grid on a sketch plane, so grid snap and drawn cells agree; null returns it to the set
   * plane.
   */
  setSketchBasis(basis: PlaneBasis | null): void;
  /**
   * Follows the camera, once per frame: moves the quad and re-chooses the spacing. The pattern is
   * fixed in world space, so moving the quad does not move the lines.
   */
  update(camera: ActiveCamera, target: Vector3): void;
  /** Reveal the other half of one axis, or none. */
  setHoveredAxis(axis: number | null): void;
  dispose(): void;
}

const GRID_VERTEX = /* glsl */ `
  uniform float uQuadScale;
  varying vec2 vLocal;
  void main() {
    // Where this point sits on the plane, measured from the quad's own centre.
    //
    // Everything downstream is built from this rather than from the world
    // position, and the difference is precision: a world position is a large
    // number as soon as the user pans away from the origin, and fract() of a
    // large 32-bit float is noise — the lines tear into moire, worse the further
    // out the model sits. This is always small, and the CPU supplies the
    // remaining offset already folded onto one period of the pattern in double
    // precision. Same lines, four more digits to draw them with.
    vLocal = position.xy * uQuadScale;

    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

/**
 * Lines are kept one pixel wide with `fwidth`, avoiding moiré in the distance. Each line's weight
 * comes from its spacing on screen, not its level, so nothing jumps when the decade changes and
 * lines crowding toward the horizon fade out.
 */
const GRID_FRAGMENT = /* glsl */ `
  uniform float uReach;
  uniform vec3 uMinor;
  uniform vec3 uMajor;
  uniform vec3 uBackground;
  uniform vec2 uPatternOffset;
  uniform float uCell;
  uniform float uCoarseBlend;
  varying vec2 vLocal;

  /** Pixels between neighbours, below which a level is gone and above which it is fully drawn. */
  const float CROWDED = 1.5;
  const float ROOMY = 7.0;
  /**
   * Pixels between neighbours across which a line stops reading as a
   * subdivision and starts reading as a rule.
   *
   * Deliberately reached well before a level's lines are as far apart as they
   * ever get. Held off until then, the picture visibly breathes: for most of
   * each decade no level is quite far enough apart to be drawn as a rule, so the
   * whole grid dims in the middle of the decade and brightens at its ends.
   * Measured at a factor of two in contrast before these were brought in.
   */
  const float RULE_FROM = 10.0;
  const float RULE_TO = 45.0;

  const float SUBDIVISION_ALPHA = 0.5;
  const float RULE_ALPHA = 1.0;

  /**
   * One level, measured: how much of this pixel its lines cover, and how many
   * pixels apart they run. Both fall out of the same derivative, so they are
   * taken together.
   */
  vec2 measureLevel(vec2 pattern, float cell) {
    vec2 coord = pattern / cell;
    vec2 width = fwidth(coord);
    vec2 edge = abs(fract(coord - 0.5) - 0.5) / max(width, vec2(1e-8));
    float coverage = 1.0 - min(min(edge.x, edge.y), 1.0);
    float spacing = 1.0 / max(max(width.x, width.y), 1e-8);
    return vec2(coverage, spacing);
  }

  void main() {
    // Measured out from what the user is looking at, not from the camera.
    //
    // From the camera is the obvious reading — ground really does recede to a
    // horizon — and it breaks a parallel view, where the camera does not move
    // when you zoom. Squared up to an axis and scrolled out, the eye stays put
    // while the visible area grows, so a reach tied to the camera stops covering
    // the screen and the floor shrinks to a patch in the middle of nothing.
    // Tied to the centre of the view and scaled by how much of the world is in
    // shot, it covers the screen at any zoom under either projection, and under
    // perspective it still puts a soft horizon exactly where the ground runs out.
    float fade = 1.0 - smoothstep(uReach * 0.25, uReach, length(vLocal));
    if (fade <= 0.001) discard;

    vec2 vPattern = vLocal + uPatternOffset;

    // One cell size for the whole plane, set per frame from the viewing distance.
    // A per-fragment size would draw rings of density that slide with the camera.
    // Only the line weight varies across the picture.
    float alpha = 0.0;
    float ruleness = 0.0;
    float cell = uCell;

    // Three nested levels at once — squares inside squares inside squares.
    for (int i = 0; i < 3; i++) {
      vec2 level = measureLevel(vPattern, cell);
      float ink = level.x * smoothstep(CROWDED, ROOMY, level.y);

      // The coarsest is the one level with no successor on screen to hand over
      // from, so it is the one that would otherwise appear from nothing when the
      // window of levels shifts up a decade. It fades in across the decade
      // instead, arriving exactly as the level below it leaves.
      if (i == 2) ink *= uCoarseBlend;

      float rule = smoothstep(RULE_FROM, RULE_TO, level.y);
      alpha = max(alpha, ink * mix(SUBDIVISION_ALPHA, RULE_ALPHA, rule));
      // Composited brightest-wins rather than picked, so every tenth line reads
      // as one continuous stroke instead of a dotted one interrupted wherever a
      // finer line crosses it.
      ruleness = max(ruleness, ink * rule);

      cell *= 10.0;
    }

    alpha *= fade;
    if (alpha <= 0.002) discard;

    // Composited here rather than by the blender, because the ground is drawn
    // in the opaque pass — see the note on the material. The result is opaque,
    // and identical to what the blender would have produced against the same
    // background.
    vec3 ink = mix(uMinor, uMajor, clamp(ruleness, 0.0, 1.0));
    gl_FragColor = vec4(mix(uBackground, ink, alpha), 1.0);

    // Three converts a colour into its linear working space the moment it is
    // read from CSS, and converts back on the way out — but only for its own
    // materials. A shader written by hand has to ask, and this one never did, so
    // every colour reached the screen still linear: #444446 arrived as 15 rather
    // than 68, *darker than the 28 of the background it sits on*. The grid was
    // drawing itself as shadow. Measured in the framebuffer, not inferred.
    #include <colorspace_fragment>
  }
`;

const AXIS_VERTEX = /* glsl */ `
  attribute vec3 colour;
  /** Which axis this vertex belongs to, and whether it is the negative half. */
  attribute float axis;
  attribute float negative;
  uniform float uHovered;
  varying vec3 vColour;
  varying vec3 vWorld;
  varying float vHidden;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vColour = colour;
    vWorld = world.xyz;
    // Both halves are always in the buffer; the negative one is only let
    // through for the axis under the pointer. Constant along a segment, since
    // both of its vertices carry the same two attributes, so there is nothing
    // for the interpolator to smear.
    vHidden = (negative > 0.5 && abs(axis - uHovered) > 0.5) ? 1.0 : 0.0;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Faded per fragment: an axis has only two distant vertices, where the fade is zero, so a
 * per-vertex fade would hide the whole line.
 */
const AXIS_FRAGMENT = /* glsl */ `
  uniform vec3 uCentre;
  uniform float uReach;
  uniform vec3 uBackground;
  varying vec3 vColour;
  varying vec3 vWorld;
  varying float vHidden;
  void main() {
    if (vHidden > 0.5) discard;
    // From the centre of the view, matching the grid exactly — the two fade out
    // together or the axes outlive the ground they lie on.
    float fade = 1.0 - smoothstep(uReach * 0.25, uReach, distance(vWorld, uCentre));
    if (fade <= 0.002) discard;
    // Composited rather than blended, for the same reason the grid is: the axes
    // belong to the ground and are drawn in the opaque pass with it. The fade is
    // 1 across everything within seven times the viewing distance, so this is
    // the same colour the blender produced everywhere a user is looking, and
    // differs only out at the horizon where both are fading out anyway.
    gl_FragColor = vec4(mix(uBackground, vColour, fade), 1.0);
  }
`;

/**
 * A grid on a selectable datum plane, with the three world axes through the origin.
 */
export function createHelpers(): Helpers {
  // Held by reference: reads through `uniforms` are `| undefined` under `noUncheckedIndexedAccess`.
  const gridUniforms = {
    uReach: { value: 1000 },
    // Background is #1c1c1c (luminance 28); minor lines need a delta of at least 15 without
    // dominating, major lines anchor the scale.
    uMinor: { value: new Color(0x404040) },
    uMajor: { value: new Color(0x656565) },
    // What the lines are composited against, which the shader has to do itself.
    uBackground: { value: new Color(0x1c1c1c) },
    // Chosen once per frame from the viewing distance, not per fragment (see GRID_FRAGMENT).
    uCell: { value: 1 },
    // Progress through the current decade, 0 to 1; fades in the coarsest level (see GRID_FRAGMENT).
    uCoarseBlend: { value: 0 },
    // Quad scale and its centre on the pattern, giving a precise pattern coordinate without large
    // world numbers (see GRID_VERTEX).
    uQuadScale: { value: 1 },
    uPatternOffset: { value: new Vector2() },
  };

  const gridMaterial = new ShaderMaterial({
    uniforms: gridUniforms,
    vertexShader: GRID_VERTEX,
    fragmentShader: GRID_FRAGMENT,
    /**
     * The ground is a backdrop, drawn first in the opaque pass (`transparent: false`) without
     * writing depth, so the model always covers it, including from below and on z = 0. Blending is
     * off in that pass, so the shader composites against `uBackground` itself.
     */
    transparent: false,
    depthWrite: false,
    // Visible from underneath as well.
    side: DoubleSide,
  });

  // A unit quad, scaled every frame; no geometry is rebuilt when the camera moves.
  const grid = new Mesh(new PlaneGeometry(1, 1), gridMaterial);
  grid.renderOrder = -2;
  // Nothing else is at the origin plane, and framing must ignore this entirely.
  grid.frustumCulled = false;

  const axisUniforms = {
    uCentre: { value: new Vector3() },
    uReach: gridUniforms.uReach,
    uBackground: gridUniforms.uBackground,
    /** Which axis the pointer is on, or -1. Only that one shows its other half. */
    uHovered: { value: -1 },
  };

  const axisMaterial = new ShaderMaterial({
    uniforms: axisUniforms,
    vertexShader: AXIS_VERTEX,
    fragmentShader: AXIS_FRAGMENT,
    // Drawn with the ground, before the body and without writing depth, so the axes never cross a
    // solid from any angle.
    transparent: false,
    depthWrite: false,
    depthTest: true,
  });

  const axes = new LineSegments(axisGeometry(), axisMaterial);
  // After the grid, so the axes read as lying on the ground and not under it.
  axes.renderOrder = -1;
  axes.frustumCulled = false;

  const cameraWorld = new Vector3();
  /** The plane the user set, and the one drawn now: they differ while the view is squared up. */
  let userPlane: GridPlane = 'XY';
  let gridPlane: GridPlane = 'XY';
  const lay = (plane: GridPlane) => {
    gridPlane = plane;
    grid.rotation.set(0, 0, 0);
    if (plane === 'XZ') grid.rotateX(Math.PI / 2);
    else if (plane === 'YZ') grid.rotateY(Math.PI / 2);
  };
  /** The sketch plane the grid lies on instead, while there is one. */
  let sketch: PlaneBasis | null = null;
  const onSketch = new Vector3();
  const along = new Vector3();
  const xAxis = new Vector3();
  const yAxis = new Vector3();
  const zAxis = new Vector3();
  const turn = new Matrix4();
  /** A point in the sketch's own coordinates, the ones its grid snap counts cells in. */
  const sketchCoordinates = (basis: PlaneBasis, point: Vector3) => {
    const dx = point.x - basis.origin.x;
    const dy = point.y - basis.origin.y;
    const dz = point.z - basis.origin.z;
    return {
      u: dx * basis.xDirection.x + dy * basis.xDirection.y + dz * basis.xDirection.z,
      v: dx * basis.yDirection.x + dy * basis.yDirection.y + dz * basis.yDirection.z,
    };
  };

  /** Maps the quad's x and y onto the plane's, so the pattern is counted in plane coordinates. */
  const orient = (basis: PlaneBasis) => {
    xAxis.set(basis.xDirection.x, basis.xDirection.y, basis.xDirection.z);
    yAxis.set(basis.yDirection.x, basis.yDirection.y, basis.yDirection.z);
    zAxis.set(basis.normal.x, basis.normal.y, basis.normal.z);
    grid.quaternion.setFromRotationMatrix(turn.makeBasis(xAxis, yAxis, zAxis));
  };

  /**
   * In a parallel view onto a cube edge or corner, the grid stands square to the line of sight
   * through the origin, with lines along the screen, instead of a sheared floor. Filled in place.
   */
  const between: PlaneBasis = {
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    xDirection: { x: 1, y: 0, z: 0 },
    yDirection: { x: 0, y: 1, z: 0 },
  };
  const squaredOn = new Vector3();
  const lastSquared = new Vector3();
  const right = new Vector3();
  let onBetween = false;

  /** `update` for a grid on a sketch plane: the same sizing, measured in that plane. */
  const followSketch = (basis: PlaneBasis, camera: ActiveCamera, target: Vector3) => {
    // Centred on the target projected onto the plane along its normal.
    along.set(target.x - basis.origin.x, target.y - basis.origin.y, target.z - basis.origin.z);
    const lift = along.dot(zAxis);
    onSketch.copy(target).addScaledVector(zAxis, -lift);
    grid.position.copy(onSketch);
    axisUniforms.uCentre.value.copy(onSketch);

    const distance = cameraWorld.distanceTo(onSketch);
    const apparent = apparentDistance(camera, distance);
    const level = gridLevel(apparent);
    gridUniforms.uCell.value = level.cell;
    gridUniforms.uCoarseBlend.value = 1 - level.blend;

    const eye = sketchCoordinates(basis, cameraWorld);
    const middle = sketchCoordinates(basis, onSketch);
    const reach = groundReach(apparent, Math.hypot(eye.u - middle.u, eye.v - middle.v));
    gridUniforms.uReach.value = reach;
    const scale = reach * QUAD_MARGIN;
    grid.scale.setScalar(scale);
    gridUniforms.uQuadScale.value = scale;

    const period = level.cell * 100;
    gridUniforms.uPatternOffset.value.set(
      foldOntoPattern(middle.u, period),
      foldOntoPattern(middle.v, period),
    );
  };

  return {
    grid,
    axes,

    setColours(minor, major, background) {
      gridUniforms.uMinor.value.setStyle(minor);
      gridUniforms.uMajor.value.setStyle(major);
      gridUniforms.uBackground.value.setStyle(background);
    },

    setHoveredAxis(axis) {
      axisUniforms.uHovered.value = axis ?? -1;
    },

    setGridPlane(plane) {
      userPlane = plane;
      if (sketch === null) lay(plane);
    },

    setSketchBasis(basis) {
      sketch = basis;
      if (basis === null) {
        lay(userPlane);
        return;
      }
      orient(basis);
    },

    update(camera, target) {
      camera.getWorldPosition(cameraWorld);
      if (sketch !== null) {
        followSketch(sketch, camera, target);
        return;
      }
      const parallel = 'isOrthographicCamera' in camera && camera.isOrthographicCamera === true;
      if (parallel && cubeDirection(cameraWorld, target, squaredOn)) {
        if (!onBetween || !squaredOn.equals(lastSquared)) {
          onBetween = true;
          lastSquared.copy(squaredOn);
          // Its x along the screen's: the camera's right, which is square to the line of sight.
          right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
          between.normal.x = squaredOn.x;
          between.normal.y = squaredOn.y;
          between.normal.z = squaredOn.z;
          between.xDirection.x = right.x;
          between.xDirection.y = right.y;
          between.xDirection.z = right.z;
          const up = right.crossVectors(squaredOn, right);
          between.yDirection.x = up.x;
          between.yDirection.y = up.y;
          between.yDirection.z = up.z;
          orient(between);
        }
        followSketch(between, camera, target);
        return;
      }
      if (onBetween) {
        onBetween = false;
        lay(gridPlane);
      }
      // In an axis view the set plane may be edge-on, so the grid follows the view (from the
      // front, XZ). Other views keep the set plane (audit B4).
      const facing = facingPlane(cameraWorld, target) ?? userPlane;
      if (facing !== gridPlane) lay(facing);
      // Centred under the orbit target, which stays put while the camera orbits.
      if (gridPlane === 'XZ') grid.position.set(target.x, 0, target.z);
      else if (gridPlane === 'YZ') grid.position.set(0, target.y, target.z);
      else grid.position.set(target.x, target.y, 0);
      axisUniforms.uCentre.value.copy(grid.position);
      // Sized for the distance to the ground, not the target (which may be atop a tall part).
      const distance = cameraWorld.distanceTo(grid.position);
      // How much world is in shot: the distance for a lens, the distance over zoom for parallel.
      const apparent = apparentDistance(camera, distance);

      // One spacing for the whole plane, from the apparent distance (the raw distance does not
      // change when a parallel view zooms).
      const level = gridLevel(apparent);
      gridUniforms.uCell.value = level.cell;
      // `blend` fades the fine level out across the decade and the coarsest in.
      gridUniforms.uCoarseBlend.value = 1 - level.blend;

      // The eye's in-plane distance from the patch centre, large when looking along the ground.
      const eye = planeCoordinates(gridPlane, cameraWorld);
      const middle = planeCoordinates(gridPlane, grid.position);
      const lateral = Math.hypot(eye.u - middle.u, eye.v - middle.v);
      const reach = groundReach(apparent, lateral);
      gridUniforms.uReach.value = reach;

      // Sized from the apparent distance: in a zoomed parallel view the real distance makes the
      // quad hundreds of times too wide, and interpolating the pattern across it loses precision
      // (moiré).
      const scale = reach * QUAD_MARGIN;
      grid.scale.setScalar(scale);
      gridUniforms.uQuadScale.value = scale;

      // The quad centre on the pattern, folded onto one period (the coarsest cell, a multiple of
      // the others) so the shader gets a small number.
      const period = level.cell * 100;
      const centre = planeCoordinates(gridPlane, target);
      gridUniforms.uPatternOffset.value.set(
        foldOntoPattern(centre.u, period),
        foldOntoPattern(centre.v, period),
      );
    },

    dispose() {
      grid.geometry.dispose();
      gridMaterial.dispose();
      axes.geometry.dispose();
      axisMaterial.dispose();
    },
  };
}

/**
 * Whether a camera looks straight along one of the cube's edges or corners (a direction with two or
 * three equal components), writing that direction, from the target towards the eye, into `out`.
 */
export function cubeDirection(eye: Vector3, target: Vector3, out: Vector3): boolean {
  out.subVectors(eye, target);
  const length = out.length();
  if (length === 0) return false;
  out.divideScalar(length);
  const snap = (value: number) => (Math.abs(value) < 0.2 ? 0 : Math.sign(value));
  const x = snap(out.x);
  const y = snap(out.y);
  const z = snap(out.z);
  const count = Math.abs(x) + Math.abs(y) + Math.abs(z);
  if (count < 2) return false;
  const norm = Math.sqrt(count);
  // Within about two degrees, as for the axis views.
  if ((out.x * x + out.y * y + out.z * z) / norm < 0.9995) return false;
  out.set(x / norm, y / norm, z / norm);
  return true;
}

/** The coordinate plane a camera looks straight onto, or null when it looks askew. */
function facingPlane(eye: Vector3, target: Vector3): GridPlane | null {
  const x = target.x - eye.x;
  const y = target.y - eye.y;
  const z = target.z - eye.z;
  const length = Math.hypot(x, y, z);
  if (length === 0) return null;
  // Within about two degrees, so a nearly-square hand-turned view does not flip the grid.
  const NEAR = 0.9995;
  if (Math.abs(z) / length > NEAR) return 'XY';
  if (Math.abs(y) / length > NEAR) return 'XZ';
  if (Math.abs(x) / length > NEAR) return 'YZ';
  return null;
}

/**
 * Where a world point falls on the grid quad's own axes. Must match the rotations in
 * `setGridPlane` (signs may differ, axes may not), or the lines slide as the camera moves.
 */
function planeCoordinates(plane: GridPlane, point: Vector3): { u: number; v: number } {
  if (plane === 'XZ') return { u: point.x, v: point.z };
  if (plane === 'YZ') return { u: -point.z, v: point.y };
  return { u: point.x, v: point.y };
}

/** The world axes through the origin: red X, green Y, blue Z. */
function axisGeometry(): BufferGeometry {
  const e = AXIS_EXTENT;
  // Six segments: both halves of each axis. The shader hides the negative half unless the pointer
  // is on that axis, so revealing it is a uniform change, not a rebuild.
  const positions = new Float32Array([
    // +X, -X
    0,
    0,
    0,
    e,
    0,
    0,
    0,
    0,
    0,
    -e,
    0,
    0,
    // +Y, -Y
    0,
    0,
    0,
    0,
    e,
    0,
    0,
    0,
    0,
    0,
    -e,
    0,
    // +Z, -Z
    0,
    0,
    0,
    0,
    0,
    e,
    0,
    0,
    0,
    0,
    0,
    -e,
  ]);

  // Saturated enough for the dark canvas, muted enough not to compete with the model.
  const x = [0.65, 0.18, 0.2];
  const y = [0.18, 0.58, 0.24];
  const z = [0.18, 0.33, 0.78];
  const colours = new Float32Array([
    ...x,
    ...x,
    ...x,
    ...x,
    ...y,
    ...y,
    ...y,
    ...y,
    ...z,
    ...z,
    ...z,
    ...z,
  ]);
  const axis = new Float32Array([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]);
  const negative = new Float32Array([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  // Not `color`: Three injects its own handling for that name, which fights a custom shader.
  geometry.setAttribute('colour', new BufferAttribute(colours, 3));
  geometry.setAttribute('axis', new BufferAttribute(axis, 1));
  geometry.setAttribute('negative', new BufferAttribute(negative, 1));
  return geometry;
}
