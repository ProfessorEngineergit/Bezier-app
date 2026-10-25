/**
 * Per-solid level of detail. The body stays one mesh (for picking, highlighting, section caps and
 * part preview) drawn as runs of solids via draw groups (`solid-lod.ts` decides which). Children:
 *
 * - coarse meshes for a heavy model, drawn for small parts while the view moves;
 * - finer meshes of nearby solids, requested once the view is still, largest first, within a
 *   triangle budget (least recently wanted evicted first).
 *
 * Both come from the kernel (`DetailSource`, `solid-detail.ts` there) a solid or small batch at a
 * time. They share the body's face numbering, so colours and highlights apply
 * (`Highlighter.addMirror`). Refined solids also get finer outlines, which would otherwise sink
 * into the finer surface.
 */

import type { EdgeSet, Mesh, TessellationOptions } from '@bezier/kernel';
import { LineSegments, type Material, Mesh as ThreeMesh } from 'three';
import type { BackgroundWork } from './background-work.js';
import { Groups, painter } from './draw-groups.js';
import { buildEdgeGeometry, edgeStartsOf } from './edges.js';
import { BASE_COLOUR, type Highlighter } from './highlight.js';
import { buildGeometry } from './mesh.js';
import {
  batchesOf,
  choose,
  coarseOptions,
  DRAWN_AS_COARSE,
  DRAWN_AS_FINE,
  FINE as DRAWN_FINE,
  joinRuns,
  measureSolids,
  nextToRefine,
  optionsAt,
  REFINED,
  runs,
  type Thresholds,
  thresholdsFor,
  type ViewSnapshot,
} from './solid-lod.js';

/** Where the view can ask for some solids of the body at another detail. */
export interface DetailSource {
  /** The setting the body itself was triangulated at. */
  base: TessellationOptions;
  mesh(solids: readonly number[], options: TessellationOptions): Promise<Mesh | null>;
  edges(solids: readonly number[], options: TessellationOptions): Promise<EdgeSet | null>;
}

export interface LodBodyDeps {
  body: ThreeMesh;
  wireframe: LineSegments | null;
  mesh: Mesh;
  edges: EdgeSet | null;
  own: Float32Array | undefined;
  surface: Material;
  lines: Material;
  highlighter: Highlighter;
  detail: DetailSource | undefined;
  /** A single-solid body was refined: its seams should be rebuilt from the finer mesh. */
  onRefined?: (mesh: Mesh) => void;
  background: BackgroundWork;
  invalidate: () => void;
}

/** Stretches of parts left out or coarse shorter than this are drawn with their neighbours. */
const BRIDGE_TRIANGLES = 20_000;
const BRIDGE_VERTICES = 20_000;
/** What all finer parts may hold between them, in triangles. */
const REFINED_BUDGET = 4_000_000;
/** Coarse meshes are made only for a model this heavy. */
const COARSE_FROM_TRIANGLES = 1_000_000;
/**
 * Max full-detail triangles per coarse mesh request. Small, since a request cannot be cancelled and
 * edits wait behind it (120,000 meant waits of up to 2.4 s).
 */
const COARSE_BATCH_TRIANGLES = 30_000;
/** Still this long before a part is asked for finer, and before coarse meshes are made. */
const REFINE_AFTER_MS = 400;
const COARSE_AFTER_MS = 1500;

/** Another drawing of some of the body's faces, as its child. */
interface Extra {
  mesh: ThreeMesh;
  edges: LineSegments | null;
  unmirror: () => void;
  triangles: number;
}

interface CoarseBatch {
  first: number;
  end: number;
  asked: boolean;
  extra: Extra | null;
  groups: Groups | null;
  starts: Uint32Array | null;
}

export class LodBody {
  readonly #deps: LodBodyDeps;
  readonly #solids: number;
  readonly #triangles: Uint32Array;
  readonly #spheres: Float32Array;
  readonly #choice: Uint8Array;
  readonly #coarseReady: Uint8Array;
  readonly #refinedReady: Uint8Array;
  readonly #levels: Uint8Array;
  readonly #refused: Uint8Array;
  readonly #wanted: Float64Array;
  readonly #pairs: Uint32Array;
  readonly #groups: Groups;
  readonly #edgeStarts: Uint32Array | null;
  readonly #edgeGroups: Groups | null;
  readonly #coarse: CoarseBatch[] = [];
  /** Per part: whether its outlines are drawn this frame (`Thresholds.edgePx`). */
  readonly #outlined: Uint8Array;
  readonly #edgeChoice: Uint8Array;
  readonly #refined = new Map<number, Extra>();
  readonly #limits: Thresholds = { cullPx: 0, coarsePx: 0, refined: false };
  readonly #stopMeasuring: () => void;
  #measured = false;
  #refinedTriangles = 0;
  #busy = false;
  #suspended = false;
  #disposed = false;
  #wasMoving = false;
  #frame = 0;
  #view: ViewSnapshot | null = null;
  /** Nothing left to request for this view until it changes. */
  #asked = false;

  constructor(deps: LodBodyDeps) {
    this.#deps = deps;
    const { mesh, body } = deps;
    const triangleCount = mesh.indices.length / 3;
    this.#triangles = mesh.solidTriangles ?? Uint32Array.from([0, triangleCount]);
    const vertices = mesh.solidVertices ?? Uint32Array.from([0, mesh.positions.length / 3]);
    const solids = this.#triangles.length - 1;
    this.#solids = solids;
    this.#spheres = new Float32Array(solids * 4);
    this.#choice = new Uint8Array(solids);
    this.#outlined = new Uint8Array(solids).fill(1);
    this.#edgeChoice = new Uint8Array(solids);
    this.#coarseReady = new Uint8Array(solids);
    this.#refinedReady = new Uint8Array(solids);
    this.#levels = new Uint8Array(solids);
    this.#refused = new Uint8Array(solids);
    this.#wanted = new Float64Array(solids);
    this.#pairs = new Uint32Array((solids + 1) * 2);

    // Drawn through groups from now on; until the parts are measured, one group is all of it.
    body.material = [deps.surface];
    this.#groups = new Groups(body.geometry);
    this.#groups.whole(mesh.indices.length);

    const starts = deps.edges === null ? null : edgeStartsOf(deps.edges, solids);
    const wireframe = deps.wireframe;
    if (wireframe !== null && starts !== null && starts.length === solids + 1) {
      wireframe.material = [deps.lines];
      this.#edgeStarts = starts;
      this.#edgeGroups = new Groups(wireframe.geometry);
      this.#edgeGroups.whole(starts[solids] ?? 0);
    } else {
      this.#edgeStarts = null;
      this.#edgeGroups = null;
    }

    if (deps.detail !== undefined && solids > 1 && triangleCount >= COARSE_FROM_TRIANGLES) {
      for (const [first, end] of batchesOf(this.#triangles, COARSE_BATCH_TRIANGLES)) {
        this.#coarse.push({ first, end, asked: false, extra: null, groups: null, starts: null });
      }
    }
    this.#stopMeasuring = deps.background.add(this.#measure(vertices));
  }

  *#measure(vertices: Uint32Array): Generator<void, void, undefined> {
    yield* measureSolids(this.#deps.mesh.positions, vertices, this.#spheres);
    this.#measured = true;
    this.#deps.invalidate();
  }

  /**
   * Whether outlines are drawn per part, so they stay during movement minus small parts
   * (`Thresholds.edgePx`). Otherwise a moving heavy model has none.
   */
  get outlinesPerPart(): boolean {
    return this.#edgeGroups !== null;
  }

  /** While a part preview replaces a solid, the body is drawn whole and nothing else. */
  suspend(suspended: boolean): void {
    this.#suspended = suspended;
    this.#deps.invalidate();
  }

  /** Before a frame is drawn: decide each part for this view. */
  plan(view: ViewSnapshot, moving: boolean, pressure: number): void {
    this.#view = view;
    this.#frame++;
    this.#asked = false;
    if (moving && !this.#wasMoving) this.#refused.fill(0);
    this.#wasMoving = moving;
    if (this.#suspended || !this.#measured) {
      this.#drawWhole();
      return;
    }
    const choice = this.#choice;
    choose(
      this.#spheres,
      view,
      this.#coarseReady,
      this.#refinedReady,
      thresholdsFor(moving, pressure, this.#limits),
      choice,
      this.#outlined,
    );
    joinRuns(choice, this.#triangles, BRIDGE_TRIANGLES);
    const pairs = this.#pairs;
    const all = this.#solids;
    this.#groups.set(
      pairs,
      runs(choice, DRAWN_AS_FINE, 0, all, this.#triangles, 0, 3, BRIDGE_TRIANGLES, pairs),
    );
    // Indexed loops and `forEach`: runs every frame, and `for…of` over a map allocates per entry.
    for (let b = 0; b < this.#coarse.length; b++) {
      const batch = this.#coarse[b];
      if (batch?.extra == null || batch.groups === null || batch.starts === null) continue;
      const count = runs(
        choice,
        DRAWN_AS_COARSE,
        batch.first,
        batch.end,
        batch.starts,
        batch.first,
        3,
        BRIDGE_TRIANGLES,
        pairs,
      );
      batch.groups.set(pairs, count);
      batch.extra.mesh.visible = count > 0;
    }
    this.#refined.forEach(this.#showRefined);
    if (this.#edgeGroups !== null && this.#edgeStarts !== null) {
      const accept = DRAWN_AS_FINE | DRAWN_AS_COARSE;
      // A part is outlined when it is drawn at all and large enough on screen for it.
      const edgeChoice = this.#edgeChoice;
      for (let s = 0; s < all; s++) {
        const drawn = ((1 << (choice[s] ?? 0)) & accept) !== 0;
        edgeChoice[s] = drawn && this.#outlined[s] === 1 ? DRAWN_FINE : 0;
      }
      const count = runs(
        edgeChoice,
        accept,
        0,
        all,
        this.#edgeStarts,
        0,
        1,
        BRIDGE_VERTICES,
        pairs,
      );
      this.#edgeGroups.set(pairs, count);
    }
  }

  readonly #showRefined = (extra: Extra, solid: number): void => {
    const shown = this.#choice[solid] === REFINED;
    extra.mesh.visible = shown;
    if (extra.edges !== null) extra.edges.visible = shown;
    if (shown) this.#wanted[solid] = this.#frame;
  };

  /** A frame with nothing to draw: time, perhaps, to ask for a part in more detail. */
  idle(stillMs: number, spare: boolean): void {
    const detail = this.#deps.detail;
    const view = this.#view;
    if (detail === undefined || view === null || this.#busy || this.#disposed || this.#asked)
      return;
    if (this.#suspended || !this.#measured || !spare || stillMs < REFINE_AFTER_MS) return;
    const next = nextToRefine(
      this.#spheres,
      this.#triangles,
      view,
      detail.base,
      this.#levels,
      this.#refused,
    );
    if (next !== null) {
      void this.#refine(detail, next.solid, next.level);
      return;
    }
    if (stillMs < COARSE_AFTER_MS) return;
    const batch = this.#coarse.find((waiting) => !waiting.asked);
    if (batch !== undefined) void this.#coarsen(detail, batch);
    else this.#asked = true;
  }

  async #refine(detail: DetailSource, solid: number, level: number): Promise<void> {
    this.#busy = true;
    const options = optionsAt(detail.base, level);
    try {
      const [mesh, edges] = await Promise.all([
        detail.mesh([solid], options),
        this.#edgeGroups === null ? null : detail.edges([solid], options),
      ]);
      if (this.#disposed) return;
      if (mesh === null) {
        this.#refused[solid] = level;
        return;
      }
      this.#dropRefined(solid);
      const extra = this.#extra(mesh, edges, false);
      this.#refined.set(solid, extra);
      this.#refinedReady[solid] = 1;
      this.#levels[solid] = level;
      this.#wanted[solid] = this.#frame;
      this.#refinedTriangles += extra.triangles;
      this.#evict(solid);
      if (this.#solids === 1) this.#deps.onRefined?.(mesh);
      this.#deps.invalidate();
    } catch {
      // Not drawn finer, and not asked again until the view moves.
      this.#refused[solid] = level;
    } finally {
      this.#busy = false;
    }
  }

  async #coarsen(detail: DetailSource, batch: CoarseBatch): Promise<void> {
    this.#busy = true;
    batch.asked = true;
    const options = coarseOptions(detail.base);
    try {
      const solids = Array.from({ length: batch.end - batch.first }, (_, i) => batch.first + i);
      const mesh = await detail.mesh(solids, options);
      if (this.#disposed || mesh === null || mesh.solidTriangles === undefined) return;
      const extra = this.#extra(mesh, null, true);
      batch.extra = extra;
      batch.groups = new Groups(extra.mesh.geometry);
      batch.starts = mesh.solidTriangles;
      this.#coarseReady.fill(1, batch.first, batch.end);
    } catch {
      // Those parts are drawn as they are while the view turns.
    } finally {
      this.#busy = false;
    }
  }

  /** Over budget: let go of the finer parts wanted least recently, never `keep`. */
  #evict(keep: number): void {
    while (this.#refinedTriangles > REFINED_BUDGET) {
      let oldest = -1;
      for (const solid of this.#refined.keys()) {
        if (solid === keep) continue;
        if (oldest === -1 || (this.#wanted[solid] ?? 0) < (this.#wanted[oldest] ?? 0)) {
          oldest = solid;
        }
      }
      if (oldest === -1) return;
      // Still in view, it would only be asked for again: not until the view moves.
      if (this.#wanted[oldest] === this.#frame) this.#refused[oldest] = this.#levels[oldest] ?? 0;
      this.#dropRefined(oldest);
    }
  }

  #dropRefined(solid: number): void {
    const extra = this.#refined.get(solid);
    if (extra === undefined) return;
    this.#refined.delete(solid);
    this.#refinedReady[solid] = 0;
    this.#levels[solid] = 0;
    this.#refinedTriangles -= extra.triangles;
    this.#release(extra);
  }

  #extra(mesh: Mesh, edges: EdgeSet | null, grouped: boolean): Extra {
    const { body, wireframe, surface, lines, own, highlighter } = this.#deps;
    const geometry = buildGeometry(mesh, BASE_COLOUR, own);
    const drawn = new ThreeMesh(geometry, grouped ? [surface] : surface);
    drawn.visible = false;
    body.add(drawn);
    let outline: LineSegments | null = null;
    if (edges !== null && wireframe !== null) {
      outline = new LineSegments(buildEdgeGeometry(edges), lines);
      outline.visible = false;
      wireframe.add(outline);
    }
    return {
      mesh: drawn,
      edges: outline,
      unmirror: highlighter.addMirror(painter(mesh, geometry)),
      triangles: mesh.indices.length / 3,
    };
  }

  #release(extra: Extra): void {
    extra.unmirror();
    extra.mesh.removeFromParent();
    extra.mesh.geometry.dispose();
    if (extra.edges !== null) {
      extra.edges.removeFromParent();
      extra.edges.geometry.dispose();
    }
  }

  #drawWhole(): void {
    this.#groups.whole(this.#deps.mesh.indices.length);
    if (this.#edgeGroups !== null && this.#edgeStarts !== null) {
      this.#edgeGroups.whole(this.#edgeStarts[this.#solids] ?? 0);
    }
    for (const batch of this.#coarse) if (batch.extra !== null) batch.extra.mesh.visible = false;
    for (const extra of this.#refined.values()) {
      extra.mesh.visible = false;
      if (extra.edges !== null) extra.edges.visible = false;
    }
  }

  dispose(): void {
    this.#disposed = true;
    this.#stopMeasuring();
    for (const solid of [...this.#refined.keys()]) this.#dropRefined(solid);
    for (const batch of this.#coarse) if (batch.extra !== null) this.#release(batch.extra);
    this.#coarse.length = 0;
  }
}
