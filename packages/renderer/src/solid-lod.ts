/**
 * Per-solid detail decisions, each frame, from a bounding sphere per solid (each solid is one
 * triangle run, `Mesh.solidTriangles`):
 *
 * - skipped when outside the view or, while moving, below about a pixel (more under load);
 * - coarse while moving and small on screen, once a coarse mesh exists;
 * - refined when close enough for facets to show, once a finer mesh exists;
 * - otherwise drawn as triangulated.
 *
 * Thresholds follow the frame budget (`frame-budget.ts`). Plain arithmetic on preallocated arrays;
 * nothing allocates.
 */

import type { TessellationOptions } from '@bezier/kernel';
import { type Camera, Frustum, Matrix4, Sphere, Vector3 } from 'three';

export const SKIP = 0;
export const FINE = 1;
export const COARSE = 2;
export const REFINED = 3;

/** The four decisions as bits, for `runs`. */
export const DRAWN_AS_FINE = 1 << FINE;
export const DRAWN_AS_COARSE = 1 << COARSE;

/**
 * A bounding sphere per solid (box centre and half diagonal), four floats each. A generator, so a
 * large model is measured in slices (`background-work.ts`).
 */
export function* measureSolids(
  positions: Float32Array,
  vertices: Uint32Array,
  spheres: Float32Array,
): Generator<void, void, undefined> {
  const solids = vertices.length - 1;
  let since = 0;
  for (let s = 0; s < solids; s++) {
    const from = vertices[s] ?? 0;
    const to = vertices[s + 1] ?? from;
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = x0;
    let z0 = x0;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = x1;
    let z1 = x1;
    for (let v = from * 3; v < to * 3; v += 3) {
      const x = positions[v] ?? 0;
      const y = positions[v + 1] ?? 0;
      const z = positions[v + 2] ?? 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    const empty = to <= from;
    spheres[s * 4] = empty ? 0 : (x0 + x1) / 2;
    spheres[s * 4 + 1] = empty ? 0 : (y0 + y1) / 2;
    spheres[s * 4 + 2] = empty ? 0 : (z0 + z1) / 2;
    spheres[s * 4 + 3] = empty ? -1 : Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
    since += to - from;
    if (since > 60_000) {
      since = 0;
      yield;
    }
  }
}

/** Where the camera is and what a millimetre is worth on screen, for one frame. */
export class ViewSnapshot {
  readonly #frustum = new Frustum();
  readonly #matrix = new Matrix4();
  readonly #sphere = new Sphere();
  readonly #eye = new Vector3();
  readonly #forward = new Vector3();
  /**
   * Pixels per millimetre at depth `z` are `#scale / (#slope · z + #base)`: perspective has slope 1
   * and base 0, orthographic the reverse, and the blend during a glide is in between. Read off the
   * projection matrix's w row.
   */
  #scale = 1;
  #slope = 1;
  #base = 0;

  /** After the camera's matrices are up to date for this frame. */
  update(camera: Camera, heightPx: number): void {
    this.#matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.#frustum.setFromProjectionMatrix(this.#matrix);
    this.#eye.setFromMatrixPosition(camera.matrixWorld);
    camera.getWorldDirection(this.#forward);
    const e = camera.projectionMatrix.elements;
    this.#scale = ((e[5] ?? 1) * heightPx) / 2;
    this.#slope = -(e[11] ?? -1);
    this.#base = e[15] ?? 0;
  }

  /** How far the sphere's nearest point lies in front of the eye, in millimetres. */
  #near(x: number, y: number, z: number, r: number): number {
    const f = this.#forward;
    const e = this.#eye;
    return (x - e.x) * f.x + (y - e.y) * f.y + (z - e.z) * f.z - r;
  }

  /** The sphere's radius on screen, in pixels; infinite with the eye inside it. */
  pixels(x: number, y: number, z: number, r: number): number {
    const depth = this.#near(x, y, z, r) + r;
    if (this.#slope > 0 && depth <= r) return Number.POSITIVE_INFINITY;
    return (r * this.#scale) / (this.#slope * depth + this.#base);
  }

  visible(x: number, y: number, z: number, r: number): boolean {
    this.#sphere.center.set(x, y, z);
    this.#sphere.radius = r;
    return this.#frustum.intersectsSphere(this.#sphere);
  }

  /** Millimetres per pixel at the sphere's nearest point. */
  worldPerPixel(x: number, y: number, z: number, r: number): number {
    const depth = this.#slope > 0 ? Math.max(this.#near(x, y, z, r), 1e-3) : 0;
    return (this.#slope * depth + this.#base) / this.#scale;
  }
}

/** When a solid is left out or drawn coarse, for this frame. */
export interface Thresholds {
  /** Smaller than this on screen (radius, pixels): left out. */
  cullPx: number;
  /** Smaller than this: drawn coarse, where a coarse mesh is ready. */
  coarsePx: number;
  /** Whether finer meshes are drawn where they are ready. */
  refined: boolean;
  /**
   * Smaller than this on screen (radius, pixels): drawn without outlines. Rises under load while
   * moving; zero when still.
   */
  edgePx?: number;
}

/**
 * When still, everything in view is drawn at full detail. While moving, sub-pixel parts are skipped
 * and small ones go coarse, with thresholds rising under frame budget pressure.
 */
export function thresholdsFor(moving: boolean, pressure: number, out: Thresholds): Thresholds {
  out.cullPx = moving ? 0.6 + 3.4 * pressure : 0;
  out.coarsePx = moving ? 16 + 184 * pressure : 0;
  out.refined = !moving || pressure < 0.5;
  out.edgePx = moving ? 3 + 37 * pressure : 0;
  return out;
}

/** Decide each solid: `SKIP`, `FINE`, `COARSE` or `REFINED`, into `choice`. */
export function choose(
  spheres: Float32Array,
  view: ViewSnapshot,
  coarse: Uint8Array,
  refined: Uint8Array,
  limits: Thresholds,
  choice: Uint8Array,
  outlined?: Uint8Array,
): void {
  const edgePx = limits.edgePx ?? 0;
  for (let s = 0; s < choice.length; s++) {
    const x = spheres[s * 4] ?? 0;
    const y = spheres[s * 4 + 1] ?? 0;
    const z = spheres[s * 4 + 2] ?? 0;
    const r = spheres[s * 4 + 3] ?? 0;
    if (r < 0 || !view.visible(x, y, z, r)) {
      choice[s] = SKIP;
      if (outlined !== undefined) outlined[s] = 0;
      continue;
    }
    const px = view.pixels(x, y, z, r);
    if (outlined !== undefined) outlined[s] = px >= edgePx ? 1 : 0;
    if (px < limits.cullPx) choice[s] = SKIP;
    else if (limits.refined && refined[s] === 1) choice[s] = REFINED;
    else if (px < limits.coarsePx && coarse[s] === 1) choice[s] = COARSE;
    else choice[s] = FINE;
  }
}

/**
 * Draws short stretches of coarse or skipped solids between two fine ones as fine (under `bridge`
 * full-detail triangles), since each run is a draw call and a few thousand triangles cost less.
 */
export function joinRuns(choice: Uint8Array, starts: Uint32Array, bridge: number): void {
  let lastFine = -1;
  for (let s = 0; s < choice.length; s++) {
    if (choice[s] !== FINE) continue;
    if (lastFine !== -1 && s - lastFine > 1) {
      const between = (starts[s] ?? 0) - (starts[lastFine + 1] ?? 0);
      if (between < bridge) {
        for (let g = lastFine + 1; g < s; g++) if (choice[g] === COARSE) choice[g] = FINE;
      }
    }
    lastFine = s;
  }
}

/**
 * Runs of consecutive solids `from`…`to` whose choice is in `accept` (bits), as `[start, count]`
 * pairs in `out`, in units of `starts` (first triangle or vertex per solid) times `unit`. For a
 * partial drawing, solid `s` is at `starts[s - shift]`. Skipped solids under `bridge` are drawn
 * through; solids drawn another way never are, or they would be drawn twice. Returns the run count.
 */
export function runs(
  choice: Uint8Array,
  accept: number,
  from: number,
  to: number,
  starts: Uint32Array,
  shift: number,
  unit: number,
  bridge: number,
  out: Uint32Array,
): number {
  let count = 0;
  let open = -1;
  let end = -1;
  let gapFrom = -1;
  // One pass further than the solids, which closes the last run.
  for (let s = from; s <= to; s++) {
    if (s === to) {
      if (open === -1) break;
    } else {
      const bit = 1 << (choice[s] ?? SKIP);
      const first = starts[s - shift] ?? 0;
      const last = starts[s - shift + 1] ?? first;
      if ((bit & accept) !== 0) {
        if (open === -1) open = first;
        end = last;
        gapFrom = -1;
        continue;
      }
      if (open === -1) continue;
      if (choice[s] === SKIP) {
        if (gapFrom === -1) gapFrom = first;
        if (last - gapFrom < bridge) continue;
      }
    }
    if (count * 2 + 1 < out.length) {
      out[count * 2] = open * unit;
      out[count * 2 + 1] = (end - open) * unit;
      count++;
    }
    open = -1;
    gapFrom = -1;
  }
  return count;
}

/** How many times finer than the body a solid can be drawn: 2⁴ in deflection. */
export const FINEST_LEVEL = 4;
/** Triangle cap for a refined solid: meshing blocks the kernel, and edits wait behind it. */
export const MOST_TRIANGLES = 800_000;
/** A chord may stray from the surface by this many pixels before it shows. */
const CHORD_PX = 0.5;

/** The settings a solid is drawn with `level` steps finer than the body's `base`. */
export function optionsAt(base: TessellationOptions, level: number): TessellationOptions {
  return {
    linearDeflection: Math.max(0.001, base.linearDeflection / 2 ** level),
    // Halved every two steps: a small hole is round by its angle, not its length.
    angularDeflection: Math.max(0.05, base.angularDeflection / 2 ** (level / 2)),
  };
}

/** How many levels finer than `base` a surface wants where a pixel is `worldPerPixel` mm. */
export function levelFor(base: TessellationOptions, worldPerPixel: number): number {
  const wanted = worldPerPixel * CHORD_PX;
  if (base.linearDeflection <= wanted) return 0;
  return Math.min(FINEST_LEVEL, Math.ceil(Math.log2(base.linearDeflection / wanted)));
}

/**
 * The solid most worth refining next and how fine, or null: the largest on screen whose facets
 * would show. Each level about doubles a curved part's triangles; levels past `MOST_TRIANGLES` are
 * not requested.
 */
export function nextToRefine(
  spheres: Float32Array,
  triangles: Uint32Array,
  view: ViewSnapshot,
  base: TessellationOptions,
  levels: Uint8Array,
  refused: Uint8Array,
): { solid: number; level: number } | null {
  let best = -1;
  let bestLevel = 0;
  let bestPx = 48;
  for (let s = 0; s < levels.length; s++) {
    const x = spheres[s * 4] ?? 0;
    const y = spheres[s * 4 + 1] ?? 0;
    const z = spheres[s * 4 + 2] ?? 0;
    const r = spheres[s * 4 + 3] ?? 0;
    if (r <= 0 || !view.visible(x, y, z, r)) continue;
    const px = view.pixels(x, y, z, r);
    if (px <= bestPx) continue;
    let level = levelFor(base, view.worldPerPixel(x, y, z, r));
    const own = (triangles[s + 1] ?? 0) - (triangles[s] ?? 0);
    while (level > 0 && own * 2 ** level > MOST_TRIANGLES) level--;
    if (level <= (levels[s] ?? 0) || level <= (refused[s] ?? 0)) continue;
    best = s;
    bestLevel = level;
    bestPx = px;
  }
  return best === -1 ? null : { solid: best, level: bestLevel };
}

/** Coarse mesh settings for small parts while moving: five times the chord, twice the angle. */
export function coarseOptions(base: TessellationOptions): TessellationOptions {
  return {
    linearDeflection: Math.max(base.linearDeflection * 5, 0.5),
    angularDeflection: Math.max(base.angularDeflection * 2, 0.8),
  };
}

/**
 * Solids in consecutive batches of about `size` triangles, as `[first, end)` pairs, so no single
 * kernel request takes long.
 */
export function batchesOf(triangles: Uint32Array, size: number): [number, number][] {
  const solids = triangles.length - 1;
  const out: [number, number][] = [];
  let first = 0;
  for (let s = 0; s < solids; s++) {
    const taken = (triangles[s + 1] ?? 0) - (triangles[first] ?? 0);
    if (taken >= size || s === solids - 1) {
      out.push([first, s + 1]);
      first = s + 1;
    }
  }
  return out;
}
