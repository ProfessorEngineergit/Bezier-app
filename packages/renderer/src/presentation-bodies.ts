/** Appearance belongs to an owning solid, never to the assembly's combined triangle buffer. */
import { type BodySummary, formatRef } from '@bezier/core';
import {
  Box3,
  type BufferGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  Scene,
  Vector3,
} from 'three/webgpu';
import { buildGeometry } from './mesh.js';
import type { PresentationSettings } from './presentation.js';
import { PresentationEmission } from './presentation-emission.js';
import {
  applyFinish,
  applyMaps,
  type FaceAppearance,
  type FaceMaterial,
  groupByMaterial,
  makeFaceMaterial,
} from './presentation-face-materials.js';
import { type FacePiece, PresentationFaces } from './presentation-faces.js';
import {
  addBoxProjectedUVs,
  PresentationMaterialLibrary,
  type PresentationMaterialSurface,
} from './presentation-material.js';
import type { DisplayGeometry } from './viewport-api.js';

interface Entry {
  /**
   * Drawn in `material`, and in faces' own where any have one (`presentation-face-materials.ts`).
   */
  mesh: Mesh<BufferGeometry, MeshPhysicalMaterial | MeshPhysicalMaterial[]>;
  /** The body's own material. */
  material: MeshPhysicalMaterial;
  maps: PresentationMaterialLibrary;
  light: PresentationEmission;
  request: number;
}
export interface BodyAppearance {
  key: string;
  settings: PresentationSettings;
  surface: PresentationMaterialSurface | null;
}

/** Which triangles belong to which body, in the order the bodies first appear. */
function groupTriangles(
  display: DisplayGeometry,
  bodies: readonly BodySummary[],
  owner: ReadonlyMap<string, string>,
  from: number,
  to: number,
  into: Map<string, number[]>,
): void {
  for (let t = from; t < to; t++) {
    const ref = display.faceRefs[display.mesh.triangleFaces[t] ?? 0];
    const key = ref ? owner.get(formatRef(ref)) : undefined;
    // A standalone renderer without body metadata still displays the supplied geometry.
    const id = key ?? (bodies.length === 0 ? 'model' : undefined);
    if (!id) continue;
    const bucket = into.get(id) ?? [];
    bucket.push(t);
    into.set(id, bucket);
  }
}

function ownersOf(bodies: readonly BodySummary[]): Map<string, string> {
  const owner = new Map<string, string>();
  for (const b of bodies) for (const f of b.faces) owner.set(formatRef(f), b.key);
  return owner;
}

/** One body's triangles as a geometry of its own, its vertices compacted. */
function pieceOf(display: DisplayGeometry, key: string, ts: readonly number[]) {
  const remap = new Map<number, number>();
  const positions: number[] = [],
    normals: number[] = [];
  const indices = new Uint32Array(ts.length * 3),
    faces = new Uint32Array(ts.length);
  ts.forEach((t, n) => {
    faces[n] = display.mesh.triangleFaces[t] ?? 0;
    for (let k = 0; k < 3; k++) {
      const old = display.mesh.indices[t * 3 + k] ?? 0;
      let fresh = remap.get(old);
      if (fresh === undefined) {
        fresh = remap.size;
        remap.set(old, fresh);
        for (let a = 0; a < 3; a++) {
          positions.push(display.mesh.positions[old * 3 + a] ?? 0);
          normals.push(display.mesh.normals[old * 3 + a] ?? 0);
        }
      }
      indices[n * 3 + k] = fresh;
    }
  });
  const geometry = buildGeometry(
    {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      indices,
      triangleFaces: faces,
    },
    [1, 1, 1],
  );
  addBoxProjectedUVs(geometry);
  return { key, geometry, faces };
}

/** Compact each solid's vertices so a large assembly is not duplicated once per part. */
export function presentationPieces(display: DisplayGeometry, bodies: readonly BodySummary[]) {
  const triangles = new Map<string, number[]>();
  groupTriangles(
    display,
    bodies,
    ownersOf(bodies),
    0,
    display.mesh.triangleFaces.length,
    triangles,
  );
  return [...triangles].map(([key, ts]) => pieceOf(display, key, ts));
}

/** How long one go at the building may hold the page before it lets the page breathe. */
const SLICE_MS = 10;

/** Back to the browser for a moment: input, painting and the rest of the app get their turn. */
function breathe(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The most bodies put into the scene before a frame is drawn with them. */
const PER_FRAME = 24;

/** After the next frame is drawn; a page that is not shown draws none, so it does not wait long. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    // No frames outside a page (a test in Node): just a turn.
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0);
      return;
    }
    const fallback = setTimeout(resolve, 100);
    requestAnimationFrame(() => {
      clearTimeout(fallback);
      // After the frame's own work, not before: the drawing of these bodies is that frame.
      setTimeout(resolve, 0);
    });
  });
}

/** The box a flat list of positions fills, found without making an object per vertex. */
export function boundsOfPositions(positions: ArrayLike<number>): Box3 {
  const box = new Box3();
  if (positions.length < 3) return box;
  let x0 = Infinity,
    y0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity,
    z1 = -Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i] ?? 0,
      y = positions[i + 1] ?? 0,
      z = positions[i + 2] ?? 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return box.set(new Vector3(x0, y0, z0), new Vector3(x1, y1, z1));
}

export class PresentationBodies {
  readonly group = new Group();
  readonly entries = new Map<string, Entry>();
  /** Faces: pointed at, picked and coloured (`presentation-faces.ts`). */
  readonly faces = new PresentationFaces();
  /** Each body's face-per-triangle list, for naming the face a ray hit. */
  readonly #pieces = new Map<string, FacePiece>();
  constructor(private readonly scene: Scene = new Scene()) {
    scene.add(this.group);
  }
  /** Bumped by every new geometry, so a build for the one before notices it was replaced. */
  #generation = 0;

  /**
   * Replaces what is shown, building bodies in slices so large assemblies never block the page.
   * Resolves when every body is in; `changed` is called as bodies appear.
   */
  async setGeometry(
    display: DisplayGeometry | null,
    bodies: readonly BodySummary[],
    changed: () => void = () => undefined,
  ): Promise<void> {
    const generation = ++this.#generation;
    this.#pieces.clear();
    for (const e of this.entries.values()) {
      this.group.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.visible = false;
      e.light.setBounds(null);
    }
    const known = new Set(bodies.map((b) => b.key));
    if (bodies.length === 0) known.add('model');
    for (const [key, e] of this.entries)
      if (!known.has(key)) {
        e.material.dispose();
        e.maps.dispose();
        e.light.dispose();
        this.entries.delete(key);
      }
    if (!display) return;

    // Sorting the triangles into bodies is most of the work and is done in slices too.
    const owner = ownersOf(bodies);
    const triangles = new Map<string, number[]>();
    const count = display.mesh.triangleFaces.length;
    const CHUNK = 100_000;
    let started = performance.now();
    for (let from = 0; from < count; from += CHUNK) {
      groupTriangles(display, bodies, owner, from, Math.min(count, from + CHUNK), triangles);
      if (performance.now() - started > SLICE_MS) {
        await breathe();
        if (generation !== this.#generation) return;
        started = performance.now();
      }
    }

    started = performance.now();
    let added = 0;
    for (const [key, ts] of triangles) {
      const { geometry, faces } = pieceOf(display, key, ts);
      this.#pieces.set(key, { body: key, geometry, faces });
      this.#show(key, geometry);
      added += 1;
      // A few at a time, then a drawn frame: programs and buffers are created on a body's first
      // frame, so hundreds at once block the page for seconds.
      if (added >= PER_FRAME || performance.now() - started > SLICE_MS) {
        changed();
        await nextFrame();
        if (generation !== this.#generation) return;
        started = performance.now();
        added = 0;
      }
    }
    this.faces.setPieces([...this.#pieces.values()], display.faceRefs);
    this.#regroup();
    changed();
  }

  /** Put one built body into the scene, reusing what it had if it was there before. */
  #show(key: string, geometry: BufferGeometry) {
    let e = this.entries.get(key);
    if (!e) {
      // Vertex colours start white, which leaves the body's colour as it is; a face given a colour
      // of its own takes it from there (`presentation-faces.ts`).
      const material = new MeshPhysicalMaterial({
        color: '#d9d8d4',
        roughness: 0.58,
        vertexColors: true,
      });
      const mesh = new Mesh<BufferGeometry, MeshPhysicalMaterial | MeshPhysicalMaterial[]>(
        geometry,
        material,
      );
      mesh.userData.bodyKey = key;
      mesh.receiveShadow = true;
      e = {
        mesh,
        material,
        maps: new PresentationMaterialLibrary(),
        light: new PresentationEmission(this.scene),
        request: 0,
      };
      this.entries.set(key, e);
    } else e.mesh.geometry = geometry;
    e.mesh.visible = true;
    e.mesh.castShadow = e.material.transmission < 0.6;
    this.group.add(e.mesh);
    e.light.setBounds(new Box3().setFromObject(e.mesh));
    const wanted = this.#wanted.get(key);
    if (wanted !== undefined) void this.#applyTo(wanted);
  }

  /** The text name of the face a triangle of a body is part of. */
  faceAt(body: string, triangle: number): string | null {
    return this.faces.faceOf(body, triangle, this.#pieces);
  }
  /** Each body's last requested look, applied to bodies that arrive later too. */
  readonly #wanted = new Map<string, BodyAppearance>();

  async apply(appearances: readonly BodyAppearance[]) {
    for (const appearance of appearances) this.#wanted.set(appearance.key, appearance);
    await Promise.all(appearances.map((appearance) => this.#applyTo(appearance)));
  }

  async #applyTo({ key, settings: s, surface }: BodyAppearance) {
    const e = this.entries.get(key);
    if (!e) return;
    const m = e.material;
    applyFinish(m, s, new Box3().setFromObject(e.mesh).getSize(new Vector3()));
    e.mesh.castShadow = s.transmission < 0.6;
    // Receiving an opaque self-shadow on transmission makes clear glass look sooty underneath.
    e.mesh.receiveShadow = s.transmission < 0.6;
    e.light.update(s);
    await applyMaps(e, e.maps, m, s, surface);
  }

  /** Faces with a material of their own, by the face's text name. */
  readonly #faceMaterials = new Map<string, FaceMaterial>();
  #faceLooks = new Map<string, FaceAppearance>();

  /**
   * All faces with their own material; omitted faces revert to the body's. Kept across rebuilds by
   * face name.
   */
  async applyFaces(appearances: readonly FaceAppearance[]) {
    this.#faceLooks = new Map(appearances.map((look) => [look.face, look]));
    for (const [face, own] of this.#faceMaterials)
      if (!this.#faceLooks.has(face)) {
        own.request++;
        own.material.dispose();
        own.maps.dispose();
        this.#faceMaterials.delete(face);
      }
    const loading: Promise<boolean>[] = [];
    for (const look of appearances) {
      let own = this.#faceMaterials.get(look.face);
      if (own === undefined) {
        own = makeFaceMaterial();
        this.#faceMaterials.set(look.face, own);
      }
      const body = this.#bodyOf(look.face);
      applyFinish(
        own.material,
        look.settings,
        body === null
          ? new Vector3(1, 1, 1)
          : new Box3().setFromObject(body).getSize(new Vector3()),
      );
      loading.push(applyMaps(own, own.maps, own.material, look.settings, look.surface));
    }
    this.#regroup();
    await Promise.all(loading);
  }

  /** The mesh a face is drawn in, or null when it is not in the model now. */
  #bodyOf(face: string): Mesh | null {
    for (const [key, piece] of this.#pieces)
      for (let t = 0; t < piece.faces.length; t++)
        if (this.faces.keyOf(piece.faces[t] ?? -1) === face)
          return this.entries.get(key)?.mesh ?? null;
    return null;
  }

  /** Each body drawn in its own material, and its faces with their own in theirs. */
  #regroup() {
    for (const [key, piece] of this.#pieces) {
      const e = this.entries.get(key);
      if (e === undefined) continue;
      const order = new Map<string, number>();
      const materials: MeshPhysicalMaterial[] = [e.material];
      for (const [face, own] of this.#faceMaterials) {
        order.set(face, materials.length);
        materials.push(own.material);
      }
      const used = groupByMaterial(
        piece.geometry,
        piece.faces,
        (face) => this.faces.keyOf(face),
        order,
      );
      e.mesh.material = used === 0 ? e.material : materials;
    }
  }

  get hasEmission() {
    return [...this.entries.values()].some(
      (e) => e.mesh.visible && e.material.emissiveIntensity > 0,
    );
  }
  dispose() {
    for (const e of this.entries.values()) {
      e.request++;
      e.mesh.geometry.dispose();
      e.material.dispose();
      e.maps.dispose();
      e.light.dispose();
    }
    this.entries.clear();
    for (const own of this.#faceMaterials.values()) {
      own.request++;
      own.material.dispose();
      own.maps.dispose();
    }
    this.#faceMaterials.clear();
    this.scene.remove(this.group);
  }
}
