/**
 * The bodies a rebuild produced, as the UI lists them. Solids have no stable kernel identity, so a
 * body's key is the earliest feature that named one of its faces (ADR 0012). That survives
 * fillets, shells, moves and joins.
 */

import type { FaceHash, GeometryKernel, ShapeId } from '@bezier/kernel';
import type { CadDocument } from '../document.js';
import type { StableRef } from '../stable-ref.js';
import type { FaceNaming } from './naming.js';
import { readRef } from './parsed-refs.js';

export interface BodySummary {
  /** Id of the feature that started the body, with `#2`, `#3` for pieces of a split body. */
  key: string;
  /** "Body 1", "Body 2", in creation order. */
  label: string;
  /** All named faces of the body, for selecting it as a whole. */
  faces: readonly StableRef[];
  hidden: boolean;
}

export interface BodyList {
  bodies: readonly BodySummary[];
  /**
   * The visible part: the body itself when nothing is hidden, null when everything is, otherwise a
   * new shape the caller disposes.
   */
  visible: ShapeId | null;
}

interface Piece {
  origin: string;
  rank: number;
  /** Stable tie-break between pieces of a split body: their sorted names. */
  signature: string;
  faces: StableRef[];
  /** One face of this solid, to find it again. */
  hash: FaceHash | undefined;
  /** The part name from an imported file, if it has one. */
  fromFile: string | null;
}

/**
 * The imported file's part name for a face: `feature` is the import, `face` the number in its tag
 * (`face-12`). Null if the file names none.
 */
export type PartNames = (feature: string, face: number) => string | null;

export async function listBodies(
  kernel: GeometryKernel,
  body: ShapeId,
  naming: FaceNaming,
  document: CadDocument,
  partNames?: PartNames,
): Promise<BodyList> {
  // Only face hashes; describing every face cost 0.8 s per rebuild on a 108,000-face assembly.
  const groups = await kernel.solidFaceGroups(body);
  if (!groups.ok) return { bodies: [], visible: body };
  {
    const names = naming.names;
    const order = new Map(document.features.map((feature, index) => [feature.id, index]));

    const pieces: Piece[] = groups.value.map((hashes) => {
      const named = hashes.flatMap((hash) => {
        const name = names.get(hash);
        return name === undefined ? [] : [name];
      });
      const faces = named.flatMap((name) => {
        const ref = readRef(name);
        return ref === null ? [] : [ref];
      });
      let origin = '';
      let rank = Number.POSITIVE_INFINITY;
      for (const face of faces) {
        if (face.kind !== 'face') continue;
        const at = order.get(face.feature) ?? Number.POSITIVE_INFINITY;
        if (at < rank || origin === '') {
          rank = at;
          origin = face.feature;
        }
      }
      const first = hashes[0];
      let fromFile: string | null = null;
      if (partNames !== undefined) {
        for (const face of faces) {
          if (face.kind !== 'face' || !face.tag.startsWith('face-')) continue;
          fromFile = partNames(face.feature, Number(face.tag.slice('face-'.length)));
          if (fromFile !== null) break;
        }
      }
      return {
        fromFile,
        origin: origin === '' ? 'body' : origin,
        rank,
        signature: [...named].sort().join('|'),
        faces,
        hash: first,
      };
    });
    pieces.sort((a, b) => a.rank - b.rank || a.signature.localeCompare(b.signature, 'en'));

    const hiddenKeys = new Set(document.meta.hiddenBodies ?? []);
    const given = document.meta.bodyNames ?? {};
    const seen = new Map<string, number>();
    const labelled = new Map<string, number>();
    const bodies = pieces.map((piece, index): BodySummary => {
      const count = (seen.get(piece.origin) ?? 0) + 1;
      seen.set(piece.origin, count);
      const key = count === 1 ? piece.origin : `${piece.origin}#${count}`;
      return {
        key,
        label: given[key] ?? fromFileLabel(piece.fromFile, labelled) ?? `Body ${index + 1}`,
        faces: piece.faces,
        hidden: hiddenKeys.has(key),
      };
    });

    const hidden = pieces.filter((_, index) => bodies[index]?.hidden === true);
    if (hidden.length === 0) return { bodies, visible: body };
    if (hidden.length === pieces.length) return { bodies, visible: null };
    const picked = hidden.flatMap((piece) => (piece.hash === undefined ? [] : [piece.hash]));
    const split = await kernel.partitionByHashes(body, picked);
    if (!split.ok) return { bodies, visible: body };
    await kernel.dispose(split.value.selected);
    return { bodies, visible: split.value.remainder };
  }
}

/** A part's name from its file; duplicates become "name (2)". */
function fromFileLabel(name: string | null, used: Map<string, number>): string | null {
  if (name === null) return null;
  const count = (used.get(name) ?? 0) + 1;
  used.set(name, count);
  return count === 1 ? name : `${name} (${String(count)})`;
}
