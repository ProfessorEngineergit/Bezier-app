/**
 * Fast drag preview for edits that affect a single solid. A full rebuild per drag step took 0.8 s
 * on a 1715-solid assembly (Voron, WebKit).
 *
 * A face pull, round or bevel only touches its own solid (`withinOwningSolids`), so that solid is
 * extracted once when the drag starts, then edited and triangulated at each step and drawn in place
 * of the original. Only for an edit at the end of the document; earlier edits still preview by
 * rebuilding, since later features could change the result. Handles are released when the drag ends
 * or the document changes.
 */

import type { TessellationChoice } from '@bezier/core';
import {
  formatRef,
  type RebuildResult,
  readRef,
  type StableRef,
  tessellationFor,
} from '@bezier/core';
import type { EdgeSet, GeometryKernel, Mesh, ShapeId, TessellationOptions } from '@bezier/kernel';

/** An edit of one part, at one value of its handle. */
export type PartEdit =
  | { kind: 'radius'; face: StableRef; radius: number }
  | { kind: 'pull'; face: StableRef; distance: number }
  | { kind: 'fillet' | 'chamfer'; edge: StableRef; size: number };

/** The edited solid, and the currently drawn faces it replaces. */
export interface PartPreview {
  mesh: Mesh;
  edges: EdgeSet | null;
  replaces: readonly StableRef[];
}

/** The reference an edit is on: the pulled face or the rounded edge. */
export function editedRef(edit: PartEdit): StableRef {
  return 'face' in edit ? edit.face : edit.edge;
}

export class PartEditPreview {
  readonly target: string;
  readonly document: unknown;
  readonly #kernel: GeometryKernel;
  readonly #handle: ShapeId;
  readonly #solid: ShapeId;
  readonly #rest: ShapeId | null;
  readonly #options: TessellationOptions | undefined;
  readonly #replaces: readonly StableRef[];

  private constructor(
    kernel: GeometryKernel,
    document: unknown,
    target: string,
    handle: ShapeId,
    parts: { selected: ShapeId; remainder: ShapeId | null },
    options: TessellationOptions | undefined,
    replaces: readonly StableRef[],
  ) {
    this.#kernel = kernel;
    this.document = document;
    this.target = target;
    this.#handle = handle;
    this.#solid = parts.selected;
    this.#rest = parts.remainder;
    this.#options = options;
    this.#replaces = replaces;
  }

  /**
   * Extracts the solid that `on` lies on from the built body, or returns null when it is gone.
   * `shown` is the drawing's faces per solid; the drawn solid is matched by shared names, since an
   * edit being dragged again has already renamed some faces.
   */
  static async start(
    kernel: GeometryKernel,
    result: RebuildResult,
    on: StableRef,
    target: string,
    tessellation: TessellationChoice | undefined,
    { document, shown }: { document: unknown; shown: readonly (readonly StableRef[])[] },
  ): Promise<PartEditPreview | null> {
    if (result.body === null) return null;
    const handle = await result.naming.resolve(kernel, on);
    // An edge identifies its solid through either adjacent face.
    const face = on.kind === 'edge' ? on.faces[0] : on;
    const owner = face === undefined ? null : await result.naming.resolve(kernel, face);
    if (handle === null || owner === null) return null;
    const parts = await kernel.partition(result.body, [owner]);
    if (!parts.ok) return null;
    // At the model's display detail, so the solid does not change look against its neighbours.
    const options = await tessellationFor(kernel, result.body, tessellation);
    const hashes = await kernel.faceHashes(parts.value.selected);
    const names = result.naming.names;
    const own = new Set((hashes.ok ? hashes.value : []).flatMap((hash) => names.get(hash) ?? []));
    // The drawn solid sharing the most names: face hashes collide on assemblies (100k faces under a
    // bound of a million), so only the best match is the part. The edited face goes first so the
    // preview takes its colour.
    let best: readonly StableRef[] = [];
    let most = 0;
    for (const solid of shown) {
      const shared = solid.reduce((n, ref) => n + (own.has(formatRef(ref)) ? 1 : 0), 0);
      if (shared > most) {
        best = solid;
        most = shared;
      }
    }
    const drawn = best.length > 0 ? best : [...own].flatMap((name) => readRef(name) ?? []);
    const named = face === undefined ? '' : formatRef(face);
    const replaces = [
      ...drawn.filter((ref) => formatRef(ref) === named),
      ...drawn.filter((ref) => formatRef(ref) !== named),
    ];
    return new PartEditPreview(kernel, document, target, handle, parts.value, options, replaces);
  }

  /** The solid with the edit applied, or null if OCCT refuses it at this value. */
  async at(edit: PartEdit): Promise<PartPreview | null> {
    const kernel = this.#kernel;
    let tool: ShapeId | null = null;
    let edited: ShapeId | null = null;
    try {
      let made: Awaited<ReturnType<GeometryKernel['fillet']>>;
      if (edit.kind === 'pull') {
        const prism = await kernel.extrudeFace(this.#handle, edit.distance);
        if (!prism.ok) return null;
        tool = prism.value;
        made =
          edit.distance > 0
            ? await kernel.fuse(this.#solid, tool)
            : await kernel.cut(this.#solid, tool);
      } else if (edit.kind === 'radius') {
        made = await kernel.resizeCylinder(this.#solid, this.#handle, edit.radius);
      } else {
        made =
          edit.kind === 'fillet'
            ? await kernel.fillet(this.#solid, [this.#handle], edit.size)
            : await kernel.chamfer(this.#solid, [this.#handle], edit.size);
      }
      if (!made.ok) return null;
      edited = made.value.shape;
      const [mesh, edges] = await Promise.all([
        kernel.tessellate(edited, this.#options),
        kernel.extractEdges(edited, this.#options),
      ]);
      if (!mesh.ok) return null;
      return { mesh: mesh.value, edges: edges.ok ? edges.value : null, replaces: this.#replaces };
    } finally {
      if (tool !== null) await kernel.dispose(tool);
      if (edited !== null) await kernel.dispose(edited);
    }
  }

  async end(): Promise<void> {
    await this.#kernel.dispose(this.#solid);
    if (this.#rest !== null) await this.#kernel.dispose(this.#rest);
  }
}
