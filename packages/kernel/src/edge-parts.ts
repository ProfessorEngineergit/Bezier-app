/**
 * Groups edges by the part they lie on, for filleting and chamfering part by part. occt-wasm only
 * accepts a single solid (`TopoDS::Solid`) as fillet or chamfer target, so a multi-part body is
 * treated per part (tools/spikes/fillet-imported.ts).
 */

import type { EvolutionData, FaceHash } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

/**
 * The solids of `body`, each with the given edges (or faces, removed part by part the same way)
 * that lie on it. The caller releases the solids' handles.
 */
export function edgesByPart(
  occt: RawKernel,
  body: RawHandle,
  edges: readonly RawHandle[],
): { part: RawHandle; edges: RawHandle[] }[] {
  return occt.getSubShapes(body, 'solid').map((part) => {
    const kind = edges[0] !== undefined && occt.getShapeType(edges[0]) === 'face' ? 'face' : 'edge';
    const own = occt.getSubShapes(part, kind);
    try {
      return { part, edges: edges.filter((edge) => own.some((e) => occt.isSame(e, edge))) };
    } finally {
      for (const e of own) occt.release(e);
    }
  });
}

/**
 * Applies `treat` to each part an edge is on and reassembles the parts with their histories
 * joined. Untouched parts keep every face, as `reassemble` in core does.
 */
export function joinByPart(
  occt: RawKernel,
  body: RawHandle,
  edges: readonly RawHandle[],
  hashesOf: (shape: RawHandle) => FaceHash[],
  treat: (
    part: RawHandle,
    on: RawHandle[],
    hashes: FaceHash[],
  ) => { shape: RawHandle; evolution: EvolutionData; done: () => void },
): { shape: RawHandle; evolution: EvolutionData } {
  const parts = edgesByPart(occt, body, edges);
  const finished: (() => void)[] = [];
  try {
    const pieces: RawHandle[] = [];
    const modified: EvolutionData['modified'][number][] = [];
    const generated: FaceHash[] = [];
    const deleted: FaceHash[] = [];
    const unchanged: FaceHash[] = [];
    for (const { part, edges: on } of parts) {
      const hashes = hashesOf(part);
      if (on.length === 0) {
        pieces.push(part);
        unchanged.push(...hashes);
        continue;
      }
      const treated = treat(part, on, hashes);
      finished.push(treated.done);
      pieces.push(treated.shape);
      modified.push(...treated.evolution.modified);
      generated.push(...treated.evolution.generated);
      deleted.push(...treated.evolution.deleted);
      unchanged.push(...treated.evolution.unchanged);
    }
    return {
      shape: occt.makeCompound(pieces),
      evolution: { modified, generated, deleted, unchanged },
    };
  } finally {
    for (const { part } of parts) occt.release(part);
    for (const done of finished) done();
  }
}
