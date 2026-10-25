/**
 * Edge lines of a solid, drawn from the kernel's extracted curves, not derived from mesh normals.
 *
 * `EdgeSet.polylineStarts` are float offsets into the flat `positions` array (index 6 is the third
 * point). A box gives 12 groups starting at 0, 6, 12 … 66 over 72 floats. `occt-wasm` has
 * documented offsets inconsistently before (docs/kernel.md); getting it wrong draws a tangle
 * silently.
 */

import type { EdgeSet } from '@bezier/kernel';
import { BufferAttribute, BufferGeometry } from 'three';

/**
 * Expands polylines into `LineSegments` vertex pairs: N points give N-1 segments (2N-2 vertices).
 * One `Line` per polyline would cost a draw call per edge.
 */
export function buildEdgeGeometry(edges: EdgeSet): BufferGeometry {
  const spans = spansOf(edges);

  let vertexCount = 0;
  for (const [from, to] of spans) {
    const points = (to - from) / 3;
    if (points >= 2) vertexCount += (points - 1) * 2;
  }

  const positions = new Float32Array(vertexCount * 3);
  let at = 0;
  for (const [from, to] of spans) {
    for (let p = from; p + 5 < to; p += 3) {
      positions[at++] = edges.positions[p] ?? 0;
      positions[at++] = edges.positions[p + 1] ?? 0;
      positions[at++] = edges.positions[p + 2] ?? 0;
      positions[at++] = edges.positions[p + 3] ?? 0;
      positions[at++] = edges.positions[p + 4] ?? 0;
      positions[at++] = edges.positions[p + 5] ?? 0;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return geometry;
}

/**
 * Start vertex of each solid's lines in `buildEdgeGeometry`'s output, plus the end (length
 * solids + 1). Null without `EdgeSet.solidLines`.
 */
export function edgeSolidVertices(edges: EdgeSet): Uint32Array | null {
  const solidLines = edges.solidLines;
  if (solidLines === undefined) return null;
  const total = edges.positions.length;
  const out = new Uint32Array(solidLines.length);
  let vertices = 0;
  let solid = 0;
  const lines = edges.polylineStarts.length;
  for (let line = 0; line <= lines; line++) {
    while (solid < solidLines.length && (solidLines[solid] ?? 0) === line) out[solid++] = vertices;
    if (line === lines) break;
    const from = edges.polylineStarts[line] ?? 0;
    const to = line + 1 < lines ? (edges.polylineStarts[line + 1] ?? total) : total;
    const points = (to - from) / 3;
    if (points >= 2) vertices += (points - 1) * 2;
  }
  while (solid < solidLines.length) out[solid++] = vertices;
  return out;
}

/**
 * `edgeSolidVertices` for a body of `solids` solids. A single-solid body has no `solidLines` (only
 * made when meshing solid by solid) but still needs its lines grouped, so refinement replaces its
 * outline along with its surface.
 */
export function edgeStartsOf(edges: EdgeSet, solids: number): Uint32Array | null {
  if (solids === 1 && edges.solidLines === undefined) {
    return edgeSolidVertices({
      ...edges,
      solidLines: Uint32Array.of(0, edges.polylineStarts.length),
    });
  }
  return edgeSolidVertices(edges);
}

/**
 * Each polyline's `[startFloat, endFloat)` range. The kernel gives only starts, so each run ends at
 * the next start and the last at the buffer end. Contiguity and order are checked, not assumed.
 */
function spansOf(edges: EdgeSet): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const total = edges.positions.length;

  for (let i = 0; i < edges.polylineStarts.length; i++) {
    const from = edges.polylineStarts[i] ?? 0;
    const to = i + 1 < edges.polylineStarts.length ? (edges.polylineStarts[i + 1] ?? total) : total;
    if (to > from) spans.push([from, to]);
  }
  return spans;
}
