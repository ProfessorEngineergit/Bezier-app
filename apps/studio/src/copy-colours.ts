/**
 * Colours for copied parts. Imported faces are coloured by name (`session-geometry.ts`), and a
 * duplicate's faces have new names, so copies would come out grey.
 *
 * A copy is matched to a part with the same face count and area. Its faces are first matched by a
 * pure shift (what Duplicate does), which must hold for every face; failing that, by what rotation
 * preserves: face size and distance from the part's centre. The second method cannot distinguish
 * faces made alike by the part's symmetry and may swap their colours.
 */

import type { FeatureRecord, StableRef } from '@bezier/core';
import { formatRef } from '@bezier/core';
import type { Mesh } from '@bezier/kernel';

const NO_COLOUR = 0xffffffff;

interface Measured {
  area: Float64Array;
  /** xyz per face: the middle of its surface. */
  centre: Float64Array;
}

/** Each face's area and centre, from its triangles. */
export function measureFaces(mesh: Mesh, faces: number): Measured {
  const area = new Float64Array(faces);
  const centre = new Float64Array(faces * 3);
  const { positions: p, indices, triangleFaces } = mesh;
  for (let t = 0; t < triangleFaces.length; t += 1) {
    const face = triangleFaces[t];
    if (face === undefined || face >= faces) continue;
    const a = (indices[t * 3] ?? 0) * 3;
    const b = (indices[t * 3 + 1] ?? 0) * 3;
    const c = (indices[t * 3 + 2] ?? 0) * 3;
    const ux = (p[b] ?? 0) - (p[a] ?? 0);
    const uy = (p[b + 1] ?? 0) - (p[a + 1] ?? 0);
    const uz = (p[b + 2] ?? 0) - (p[a + 2] ?? 0);
    const vx = (p[c] ?? 0) - (p[a] ?? 0);
    const vy = (p[c + 1] ?? 0) - (p[a + 1] ?? 0);
    const vz = (p[c + 2] ?? 0) - (p[a + 2] ?? 0);
    const size = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    area[face] = (area[face] ?? 0) + size;
    for (let axis = 0; axis < 3; axis += 1) {
      const mid = ((p[a + axis] ?? 0) + (p[b + axis] ?? 0) + (p[c + axis] ?? 0)) / 3;
      centre[face * 3 + axis] = (centre[face * 3 + axis] ?? 0) + mid * size;
    }
  }
  for (let face = 0; face < faces; face += 1) {
    const size = area[face] ?? 0;
    if (size === 0) continue;
    for (let axis = 0; axis < 3; axis += 1) {
      centre[face * 3 + axis] = (centre[face * 3 + axis] ?? 0) / size;
    }
  }
  return { area, centre };
}

interface Part {
  faces: number[];
  /** Centre of the part's whole surface. */
  middle: [number, number, number];
  /** Same for a part and any copy of it. */
  shape: string;
  /** Per face, in the order of `faces`: what distinguishes it from the part's other faces. */
  marks: string[];
}

/** Hundredths: tighter than any two different faces of a real part, looser than float noise. */
const rounded = (value: number) => value.toFixed(2);

function describe(faces: number[], measured: Measured): Part {
  let total = 0;
  const middle = [0, 0, 0];
  for (const face of faces) {
    const size = measured.area[face] ?? 0;
    total += size;
    for (let axis = 0; axis < 3; axis += 1) {
      middle[axis] = (middle[axis] ?? 0) + (measured.centre[face * 3 + axis] ?? 0) * size;
    }
  }
  const marks = faces.map((face) => {
    const away = Math.hypot(
      (measured.centre[face * 3] ?? 0) - (middle[0] ?? 0) / (total || 1),
      (measured.centre[face * 3 + 1] ?? 0) - (middle[1] ?? 0) / (total || 1),
      (measured.centre[face * 3 + 2] ?? 0) - (middle[2] ?? 0) / (total || 1),
    );
    return `${rounded(measured.area[face] ?? 0)}|${rounded(away)}`;
  });
  const at = total || 1;
  return {
    faces,
    middle: [(middle[0] ?? 0) / at, (middle[1] ?? 0) / at, (middle[2] ?? 0) / at],
    shape: `${faces.length}|${rounded(total)}`,
    marks,
  };
}

/**
 * The face of `source` that each face of `copy` lies one shift away from, or null when the copy is
 * not a pure shift of the source.
 */
function shifted(copy: Part, source: Part, measured: Measured): number[] | null {
  const where = (face: number, by: readonly number[]) =>
    [0, 1, 2]
      .map((axis) => rounded((measured.centre[face * 3 + axis] ?? 0) + (by[axis] ?? 0)))
      .join('|');
  const shift = [0, 1, 2].map((axis) => (copy.middle[axis] ?? 0) - (source.middle[axis] ?? 0));
  const bySpot = new Map<string, number>();
  for (const face of source.faces) bySpot.set(where(face, shift), face);
  const matched: number[] = [];
  for (const face of copy.faces) {
    const from = bySpot.get(where(face, [0, 0, 0]));
    if (from === undefined) return null;
    matched.push(from);
  }
  return matched;
}

/**
 * Gives faces of copied parts the colours of their originals. Mutates `colours`, which holds the
 * file-assigned colours on entry. Returns whether anything was added.
 */
export function colourCopies(
  colours: Uint32Array,
  features: readonly FeatureRecord[],
  faceRefs: readonly (StableRef | null)[],
  bodyRefs: readonly (readonly StableRef[])[],
  mesh: Mesh,
): boolean {
  const copies = new Set(
    features.filter((feature) => feature.type === 'transform-copy').map((feature) => feature.id),
  );
  if (copies.size === 0) return false;

  const indexOf = new Map<string, number>();
  faceRefs.forEach((ref, index) => {
    if (ref !== null) indexOf.set(formatRef(ref), index);
  });
  const measured = measureFaces(mesh, faceRefs.length);
  const parts = bodyRefs.map((solid) =>
    describe(
      solid.map((ref) => indexOf.get(formatRef(ref)) ?? -1).filter((index) => index >= 0),
      measured,
    ),
  );
  const coloured = (part: Part) => part.faces.some((face) => colours[face] !== NO_COLOUR);
  const isCopy = (part: Part) =>
    part.faces.length > 0 &&
    part.faces.every((face) => {
      const ref = faceRefs[face];
      return ref?.kind === 'face' && copies.has(ref.feature);
    });

  let added = false;
  // A copy of a copy finds its colours on the second pass, once the first copy has them.
  for (let pass = 0; pass < 4; pass += 1) {
    const sources = new Map<string, Part>();
    for (const part of parts)
      if (coloured(part) && !sources.has(part.shape)) sources.set(part.shape, part);
    let changed = false;
    for (const part of parts) {
      if (!isCopy(part) || coloured(part)) continue;
      const source = sources.get(part.shape);
      if (source === undefined) continue;
      const exact = shifted(part, source, measured);
      if (exact !== null) {
        exact.forEach((from, at) => {
          const colour = colours[from];
          const face = part.faces[at];
          if (colour === undefined || colour === NO_COLOUR || face === undefined) return;
          colours[face] = colour;
          changed = true;
        });
        continue;
      }
      const byMark = new Map<string, number>();
      source.marks.forEach((mark, at) => {
        const colour = colours[source.faces[at] ?? -1];
        if (colour !== undefined && colour !== NO_COLOUR && !byMark.has(mark))
          byMark.set(mark, colour);
      });
      part.marks.forEach((mark, at) => {
        const colour = byMark.get(mark);
        const face = part.faces[at];
        if (colour === undefined || face === undefined) return;
        colours[face] = colour;
        changed = true;
      });
    }
    if (!changed) break;
    added = true;
  }
  return added;
}
