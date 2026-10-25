/**
 * Display meshes and outlines for `occt-kernel.ts`: cached per part (`tessellation.ts`), stored for
 * imports (`kept-displays.ts`) and split across workers for large imports (`mesh-parts.ts`).
 */
import type { KernelResult } from './errors.js';
import type { KeptDisplays } from './kept-displays.js';
import {
  AdoptedMeshes,
  type MeshedPacket,
  type MeshPacket,
  meshPacket,
  splitForMeshing,
} from './mesh-parts.js';
import { attempt } from './occt-support.js';
import { detailEdgeCache, detailMeshCache, edgesOfSolids, meshOfSolids } from './solid-detail.js';
import { edgeCache, edgesOf, meshCache, meshOf, type Piece } from './tessellation.js';
import {
  DEFAULT_TESSELLATION,
  type EdgeSet,
  type Mesh,
  type MeshPiece,
  type ShapeId,
  type TessellationOptions,
} from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

/** What the kernel lends this: its shape table and the means it was built with. */
interface Lent {
  resolve: (id: ShapeId) => RawHandle;
  alive: (budgetMs?: number) => void;
  stream: ((piece: MeshPiece) => void) | undefined;
  kept: KeptDisplays | undefined;
}

export class ShapeDisplay {
  readonly #occt: RawKernel;
  readonly #with: Lent;
  /** Meshes and outlines of solids already drawn, reused while unchanged. */
  readonly #meshes = meshCache();
  readonly #edges = edgeCache();
  /** Solids drawn finer or coarser than their body, for the view (`solid-detail.ts`). */
  readonly #detailMeshes = detailMeshCache();
  readonly #detailEdges = detailEdgeCache();
  /** Meshes and outlines other workers made for a large import (`mesh-parts.ts`). */
  readonly #adopted: AdoptedMeshes;
  /** Writes to the store still under way (`#keep`), for `flush`. */
  readonly #writing = new Set<Promise<void>>();

  constructor(occt: RawKernel, lent: Lent) {
    this.#occt = occt;
    this.#with = lent;
    this.#adopted = new AdoptedMeshes(occt);
  }

  async tessellate(
    shape: ShapeId,
    options: TessellationOptions = DEFAULT_TESSELLATION,
  ): Promise<KernelResult<Mesh>> {
    const kept = this.#with.kept;
    await kept?.prepare(options);
    const adopted = this.#adopted.mesh(options);
    const keptMesh = kept?.mesh(options);
    const known = (part: RawHandle): Piece | undefined => keptMesh?.(part) ?? adopted(part);
    // meshShape and not tessellate: it returns per-face triangle groups, and without them a
    // click on the model cannot be resolved to a named face. See ./tessellation.ts.
    const mesh = attempt('invalid-result', 'This shape could not be prepared for display.', () =>
      meshOf(
        this.#occt,
        this.#with.resolve(shape),
        options,
        this.#meshes,
        this.#with.alive,
        this.#with.stream,
        known,
      ),
    );
    if (mesh.ok) this.#keep(options);
    return mesh;
  }

  async tessellateSolids(
    shape: ShapeId,
    solids: readonly number[],
    options: TessellationOptions,
  ): Promise<KernelResult<Mesh>> {
    return attempt('invalid-result', 'These parts could not be prepared for display.', () =>
      meshOfSolids(
        this.#occt,
        this.#with.resolve(shape),
        shape,
        solids,
        options,
        this.#detailMeshes,
        this.#with.alive,
      ),
    );
  }

  async extractSolidEdges(
    shape: ShapeId,
    solids: readonly number[],
    options: TessellationOptions,
  ): Promise<KernelResult<EdgeSet>> {
    return attempt('invalid-result', 'The outlines of these parts could not be built.', () =>
      edgesOfSolids(
        this.#occt,
        this.#with.resolve(shape),
        solids,
        options,
        this.#detailEdges,
        this.#with.alive,
      ),
    );
  }

  async extractEdges(
    shape: ShapeId,
    options: TessellationOptions = DEFAULT_TESSELLATION,
  ): Promise<KernelResult<EdgeSet>> {
    const kept = this.#with.kept;
    await kept?.prepare(options);
    const adopted = this.#adopted.edges(options);
    const keptEdges = kept?.edges(options);
    const known = (part: RawHandle): EdgeSet | undefined => keptEdges?.(part) ?? adopted(part);
    const edges = attempt('invalid-result', 'The outlines of this shape could not be built.', () =>
      edgesOf(this.#occt, this.#with.resolve(shape), options, this.#edges, this.#with.alive, known),
    );
    if (edges.ok) this.#keep(options);
    return edges;
  }

  /** The parts of `shape` in packets for helper workers to mesh (`mesh-parts.ts`). */
  async splitForMeshing(shape: ShapeId, count: number): Promise<KernelResult<MeshPacket[] | null>> {
    return attempt('invalid-result', 'The parts could not be handed out for meshing.', () =>
      splitForMeshing(this.#occt, this.#with.resolve(shape), count, () => this.#with.alive()),
    );
  }

  /** A packet of parts meshed and outlined here, for the worker that handed it out. */
  async meshPacket(
    brep: Uint8Array,
    options: TessellationOptions,
  ): Promise<KernelResult<MeshedPacket>> {
    return attempt('invalid-result', 'These parts could not be meshed.', () =>
      meshPacket(this.#occt, brep, options, this.#with.alive),
    );
  }

  /** A packet another worker meshed, taken as if meshed here; false when it does not fit. */
  async adoptMeshes(
    shape: ShapeId,
    packet: { first: number; end: number } & MeshedPacket,
    options: TessellationOptions,
  ): Promise<KernelResult<boolean>> {
    return attempt('invalid-result', 'The meshed parts could not be taken over.', () =>
      this.#adopted.adopt(this.#with.resolve(shape), packet, options),
    );
  }

  async flush(): Promise<void> {
    await Promise.all(this.#writing);
  }

  /** Stores what was just made without making the caller wait. */
  #keep(options: TessellationOptions): void {
    const kept = this.#with.kept;
    if (kept === undefined) return;
    const writing = kept.keep(options, this.#meshes, this.#edges);
    this.#writing.add(writing);
    void writing.finally(() => this.#writing.delete(writing));
  }
}
