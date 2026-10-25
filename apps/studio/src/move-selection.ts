import { type BodySummary, formatRef, type StableRef } from '@bezier/core';

/**
 * What Move acts on. A chosen body moves whole (all its faces are selected); a face, edge or vertex
 * picked alone moves alone and its neighbouring faces follow.
 */
export type MoveTarget =
  | { kind: 'bodies'; faces: readonly StableRef[] }
  | {
      kind: 'parts';
      faces: readonly StableRef[];
      edges: readonly StableRef[];
      vertices: readonly StableRef[];
    };

export function moveTarget(
  bodies: readonly BodySummary[],
  selected: readonly StableRef[],
): MoveTarget {
  const faces = selected.filter((ref) => ref.kind === 'face');
  const edges = selected.filter((ref) => ref.kind === 'edge');
  const vertices = selected.filter((ref) => ref.kind === 'vertex');
  const have = new Set(faces.map(formatRef));
  const whole = bodies.filter(
    (body) => body.faces.length > 0 && body.faces.every((face) => have.has(formatRef(face))),
  );
  // An empty selection means the body or bodies it is on.
  if (faces.length + edges.length + vertices.length === 0) return { kind: 'bodies', faces };
  if (whole.length > 0) return { kind: 'bodies', faces: whole.flatMap((body) => body.faces) };
  // Without a body list, faces cannot be assigned to bodies.
  if (bodies.length === 0) return { kind: 'bodies', faces };
  return { kind: 'parts', faces, edges, vertices };
}
