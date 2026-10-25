/**
 * Draws one edge, or one face's border, in the selection colour. The kernel's `EdgeSet` has no
 * identity, so topology is recovered from the mesh: a triangle edge between two different faces is
 * a seam, which is what the naming scheme calls an edge (`seams.ts`). Seams are matched by welded
 * position, not vertex index, since the tessellation splits vertices per face.
 */

import type { Mesh } from '@bezier/kernel';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { type EndIndex, extendRun, indexEnds } from './seam-chain.js';
import { type SeamMiddle, seamMidpoint } from './seam-midpoint.js';
import { buildSeams, facesOf, type Seam, type SeamTable, seamAt, WELD } from './seams.js';

/** Outline width in pixels, roughly matching the edge pick tolerance. */
const OUTLINE_WIDTH = 2.6;

/**
 * How far the line is pulled toward the eye before depth testing, in pixels' worth of world
 * distance. A fixed depth-buffer offset is not enough along rims seen nearly edge-on. Rear seams
 * stay hidden unless the part is thinner than this on screen.
 */
const PULL_PX = 3;

function pullTowardTheEye(material: LineMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      'vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );',
      `vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );
			{
				// One pixel's world size at unit distance (perspective) or anywhere (parallel).
				float pixel = 2.0 / ( projectionMatrix[ 1 ][ 1 ] * resolution.y );
				if ( projectionMatrix[ 3 ][ 3 ] == 1.0 ) {
					start.z += ${PULL_PX.toFixed(1)} * pixel;
					end.z += ${PULL_PX.toFixed(1)} * pixel;
				} else {
					float pull = max( 0.5, 1.0 - ${PULL_PX.toFixed(1)} * pixel );
					start.xyz *= pull;
					end.xyz *= pull;
				}
			}`,
    );
  };
}

export class Outliner {
  readonly object: LineSegments2;

  /**
   * A fat line built from camera-facing quads; WebGL ignores `LineBasicMaterial.linewidth`.
   */
  readonly #material = new LineMaterial({
    linewidth: OUTLINE_WIDTH,
    // The selected silhouette is visible; rear seams must not become x-ray lines.
    depthTest: true,
    depthWrite: false,
    transparent: true,
    // A few depth steps toward the eye, so the outline wins over the black edge and the face on the
    // same seam; still far less than any face in front of a rear seam.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });

  #table: SeamTable | null = null;
  #positions = new Float32Array(0);

  get seams(): SeamTable | null {
    return this.#table;
  }

  constructor(colour: number) {
    this.#material.color.setHex(colour);
    pullTowardTheEye(this.#material);
    this.object = new LineSegments2(new LineSegmentsGeometry(), this.#material);
    // Draw after the surface, retaining depth occlusion for rear seams.
    this.object.renderOrder = 3;
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  /** Matches the line width to the drawing buffer size. */
  setSize(width: number, height: number): void {
    this.#material.resolution.set(width, height);
  }

  /** The selection colour, as `0xRRGGBB`. */
  setColour(hex: number): void {
    this.#material.color.setHex(hex);
  }

  /** Give the outliner a body to read seams from, or null to forget one. */
  setGeometry(mesh: Mesh | null): void {
    this.#table = mesh === null ? null : buildSeams(mesh);
    this.#positions = new Float32Array((this.#table?.count ?? 0) * 6);
    this.#draw(0);
    this.#scheduleIndex();
  }

  /** Seams for a large mesh, built in a worker (off-thread.ts). Nothing is outlined until then. */
  awaitSeams(): void {
    this.#table = null;
    this.#positions = new Float32Array(0);
    this.#draw(0);
  }

  adoptSeams(table: SeamTable): void {
    this.#table = table;
    this.#positions = new Float32Array(table.count * 6);
    this.#draw(0);
    this.#scheduleIndex();
  }

  /** Outline the whole border of these faces, or nothing when empty. */
  showFaces(faces: readonly number[]): void {
    if (faces.length === 0) {
      this.#draw(0);
      return;
    }
    const wanted = new Set(faces);
    this.#fill((table, seam) => {
      // Every border edge of a wanted face, including those whose neighbour was not matched.
      for (const face of facesOf(table, seam)) if (wanted.has(face)) return true;
      return false;
    });
  }

  /**
   * The corners of these faces in world millimetres: points where three or more faces meet. Unlike
   * a turn-angle rule this excludes tessellation vertices along edges and holds on curved surfaces.
   */
  cornersOf(faces: readonly number[]): { x: number; y: number; z: number }[] {
    const table = this.#table;
    if (table === null || faces.length === 0) return [];
    const wanted = new Set(faces);
    const touching: Seam[] = [];
    for (let seam = 0; seam < table.count; seam++) {
      const around = facesOf(table, seam);
      for (const face of around) {
        if (!wanted.has(face)) continue;
        touching.push(seamAt(table, seam));
        break;
      }
    }
    return cornersFrom(touching, faces);
  }

  /** Marks a corner with three short strokes crossing at it, `size` millimetres each way. */
  showCorner(x: number, y: number, z: number, size: number): void {
    if (this.#positions.length < 18) this.#positions = new Float32Array(18);
    const p = this.#positions;
    p.set([
      x - size,
      y,
      z,
      x + size,
      y,
      z,
      x,
      y - size,
      z,
      x,
      y + size,
      z,
      x,
      y,
      z - size,
      x,
      y,
      z + size,
    ]);
    this.#draw(18);
  }

  /** Outlines the seam between exactly these two faces, as an edge reference names it. */
  showSeam(a: number, b: number): void {
    const table = this.#table;
    if (table === null) {
      this.#draw(0);
      return;
    }
    const seeds: number[] = [];
    for (let seam = 0; seam < table.count; seam++) if (between(table, seam, a, b)) seeds.push(seam);
    // The whole smooth run (`seam-chain.ts`). Until the end index exists, the edge alone is drawn.
    const run = this.#ends?.table === table ? extendRun(table, this.#ends.index, seeds) : seeds;
    if (this.#positions.length < run.length * 6) this.#positions = new Float32Array(run.length * 6);
    let at = 0;
    for (const seam of run) {
      this.#positions.set(table.ends.subarray(seam * 6, seam * 6 + 6), at);
      at += 6;
    }
    this.#draw(at);
  }

  #ends: { table: SeamTable; index: EndIndex } | null = null;
  #indexing: ReturnType<typeof setTimeout> | undefined;

  /** Builds the seam end index after a short delay, off the hover path. */
  #scheduleIndex(): void {
    clearTimeout(this.#indexing);
    const table = this.#table;
    if (table === null) return;
    this.#indexing = setTimeout(() => {
      if (this.#table === table && this.#ends?.table !== table)
        this.#ends = { table, index: indexEnds(table) };
    }, 300);
  }

  /**
   * The seam between exactly these two faces closest to `anchor`, or null. Closest rather than
   * first, so a long or curved edge gives the tangent at the picked point.
   */
  seamBetween(a: number, b: number, ax: number, ay: number, az: number): Seam | null {
    const table = this.#table;
    const nearest = this.#nearestSeam(a, b, ax, ay, az);
    return table === null || nearest < 0 ? null : seamAt(table, nearest);
  }

  /** Which seam between exactly these two faces is closest to a point, or -1. */
  #nearestSeam(a: number, b: number, ax: number, ay: number, az: number): number {
    const table = this.#table;
    if (table === null) return -1;
    let best = -1;
    let bestDist = Infinity;
    for (let seam = 0; seam < table.count; seam++) {
      if (!between(table, seam, a, b)) continue;
      const at = seam * 6;
      const e = table.ends;
      const dist = segmentPointDist(
        e[at] ?? 0,
        e[at + 1] ?? 0,
        e[at + 2] ?? 0,
        e[at + 3] ?? 0,
        e[at + 4] ?? 0,
        e[at + 5] ?? 0,
        ax,
        ay,
        az,
      );
      if (dist < bestDist) {
        bestDist = dist;
        best = seam;
      }
    }
    return best;
  }

  /** The arclength midpoint of the connected edge nearest the picked location. */
  midpointBetween(
    a: number,
    b: number,
    anchor: { x: number; y: number; z: number },
  ): SeamMiddle | null {
    const table = this.#table;
    const nearest = this.#nearestSeam(a, b, anchor.x, anchor.y, anchor.z);
    if (table === null || nearest < 0) return null;
    // The seed must be one of the listed segments itself: `seamMidpoint` matches by identity.
    const along: Seam[] = [];
    let seed: Seam | null = null;
    for (let seam = 0; seam < table.count; seam++) {
      if (!between(table, seam, a, b)) continue;
      const segment = seamAt(table, seam);
      if (seam === nearest) seed = segment;
      along.push(segment);
    }
    return seed === null ? null : seamMidpoint(along, seed);
  }

  clear(): void {
    this.#draw(0);
  }

  dispose(): void {
    clearTimeout(this.#indexing);
    this.object.geometry.dispose();
    this.#material.dispose();
  }

  #fill(wanted: (table: SeamTable, seam: number) => boolean): void {
    const table = this.#table;
    let at = 0;
    if (table !== null) {
      for (let seam = 0; seam < table.count; seam++) {
        if (!wanted(table, seam)) continue;
        this.#positions.set(table.ends.subarray(seam * 6, seam * 6 + 6), at);
        at += 6;
      }
    }
    this.#draw(at);
  }

  /**
   * Hands the filled prefix of the buffer to a new geometry. Instanced fat lines have no draw range
   * to shorten; this only runs when the picked thing changes.
   */
  #draw(floats: number): void {
    this.object.visible = floats > 0;
    if (floats === 0) return;
    // A fresh geometry each time: three.js fixes an instanced geometry's segment count at its first
    // upload and never draws more.
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(this.#positions.subarray(0, floats));
    this.object.geometry.dispose();
    this.object.geometry = geometry;
    this.object.computeLineDistances();
  }
}

/** Whether exactly these two faces meet along a seam, and no third. */
function between(table: SeamTable, seam: number, a: number, b: number): boolean {
  if (table.more.has(seam)) return false;
  const first = table.first[seam] ?? -1;
  const second = table.second[seam] ?? -1;
  return (first === a && second === b) || (first === b && second === a);
}

function weld(x: number, y: number, z: number): string {
  const q = (v: number) => Math.round(v / WELD);
  return `${q(x)},${q(y)},${q(z)}`;
}

function segmentPointDist(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  px: number,
  py: number,
  pz: number,
): number {
  const dx = bx - ax,
    dy = by - ay,
    dz = bz - az;
  const lenSq = dx * dx + dy * dy + dz * dz;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy), pz - (az + t * dz));
}

/** The corners among a set of seams for the given faces. Standalone so it can be unit tested. */
export function cornersFrom(
  seams: readonly Seam[],
  faces: readonly number[],
): { x: number; y: number; z: number }[] {
  if (faces.length === 0) return [];
  const wanted = new Set(faces);

  // Gather, per position, every face any seam touching it belongs to.
  const meeting = new Map<
    string,
    { at: { x: number; y: number; z: number }; faces: Set<number> }
  >();
  const note = (x: number, y: number, z: number, seamFaces: Set<number>) => {
    const key = weld(x, y, z);
    const found = meeting.get(key);
    if (found === undefined) {
      meeting.set(key, { at: { x, y, z }, faces: new Set(seamFaces) });
      return;
    }
    for (const face of seamFaces) found.faces.add(face);
  };

  for (const seam of seams) {
    if (![...seam.faces].some((face) => wanted.has(face))) continue;
    note(seam.ax, seam.ay, seam.az, seam.faces);
    note(seam.bx, seam.by, seam.bz, seam.faces);
  }

  const corners: { x: number; y: number; z: number }[] = [];
  for (const point of meeting.values()) {
    if (point.faces.size >= 3) corners.push(point.at);
  }
  return corners;
}
