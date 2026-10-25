/**
 * Geometry queries on a session's rebuilt body: what the viewport draws, face names and body
 * contacts. Separate from `session.ts`, which handles the document and its journal.
 */

import {
  type BodySummary,
  type CadDocument,
  faceSketchBasis,
  formatRef,
  type PlaneBasis,
  type RebuildResult,
  readRef,
  type StableRef,
  type TessellationChoice,
  worldToPlane,
} from '@bezier/core';
import {
  DEFAULT_TESSELLATION,
  type FaceHash,
  type GeometryKernel,
  type KernelResult,
  type ShapeId,
  type TessellationOptions,
  textKey,
} from '@bezier/kernel';
import type { DetailSource, DisplayGeometry } from '@bezier/renderer';
import { colourCopies } from './copy-colours.js';
import { listBodiesNamed } from './import-part-names.js';
import type { BodyContact } from './session.js';

/** With more bodies than this in contact, no join or cut is offered. */
const CONTACT_LIMIT = 8;

/** The other bodies the body owning `face` touches or overlaps. */
export async function contactsIn(
  kernel: GeometryKernel,
  result: RebuildResult,
  document: CadDocument,
  face: StableRef,
): Promise<readonly BodyContact[]> {
  if (result.body === null) return [];
  const listed = await listBodiesNamed(kernel, result.body, result.naming, document);
  if (listed.visible !== null && listed.visible !== result.body) {
    await kernel.dispose(listed.visible);
  }
  const key = formatRef(face);
  const subject = listed.bodies.find((body) => body.faces.some((f) => formatRef(f) === key));
  if (subject === undefined) return [];
  const solidOf = async (body: BodySummary) => {
    const [first] = body.faces;
    const handle = first === undefined ? null : await result.naming.resolve(kernel, first);
    if (handle === null || result.body === null) return null;
    const parts = await kernel.partition(result.body, [handle]);
    if (!parts.ok) return null;
    if (parts.value.remainder !== null) await kernel.dispose(parts.value.remainder);
    return parts.value.selected;
  };
  const mine = await solidOf(subject);
  if (mine === null) return [];
  const found: BodyContact[] = [];
  try {
    // One kernel call, only against solids whose boxes reach this one. Testing every body took
    // minutes beside a 1,715-part assembly and blocked the session queue.
    const near = await kernel.contactsNear(result.body, mine, CONTACT_LIMIT);
    if (!near.ok || near.value === null) return [];
    const names = result.naming.names;
    const met = new Map<string, 'touching' | 'overlapping'>();
    for (const { face: hash, contact } of near.value) {
      const name = names.get(hash);
      if (name !== undefined) met.set(name, contact);
    }
    for (const other of listed.bodies) {
      if (other.key === subject.key || other.hidden) continue;
      for (const face of other.faces) {
        const contact = met.get(formatRef(face));
        if (contact === undefined) continue;
        found.push({ body: other, subject, contact });
        break;
      }
    }
  } finally {
    await kernel.dispose(mine);
  }
  return found;
}

/**
 * What the viewport draws: the non-hidden bodies. With nothing hidden that is the rebuild's own
 * mesh; otherwise the rest is triangulated again, because picking relies on face order (`namesOf`)
 * from the triangulated shape, so triangles cannot simply be skipped.
 */
export async function displayOf(
  kernel: GeometryKernel,
  result: RebuildResult,
  visible: ShapeId | null,
  tessellation: TessellationChoice | undefined,
): Promise<DisplayGeometry | null> {
  if (result.body === null || visible === null) return null;
  const own = visible === result.body;
  if (own && result.mesh !== null) {
    const faces = await kernel.faceHashes(result.body);
    const base =
      typeof tessellation === 'function'
        ? tessellation(faces.ok ? faces.value.length : 0)
        : tessellation;
    return {
      mesh: result.mesh,
      edges: result.edges,
      detail: detailOf(kernel, result.body, base ?? DEFAULT_TESSELLATION),
      ...(await namesOf(kernel, result.body, result.naming, faces)),
    };
  }
  try {
    // Fetched once: the count picks the detail and the order is the order of the names.
    const faces = await kernel.faceHashes(visible);
    const options =
      typeof tessellation === 'function'
        ? tessellation(faces.ok ? faces.value.length : 0)
        : tessellation;
    const [mesh, edges] = await Promise.all(
      options === undefined
        ? [kernel.tessellate(visible), kernel.extractEdges(visible)]
        : [kernel.tessellate(visible, options), kernel.extractEdges(visible, options)],
    );
    if (!mesh.ok) return null;
    return {
      mesh: mesh.value,
      edges: edges.ok ? edges.value : null,
      // Only the rebuild's own body (nothing hidden, the usual case since rebuilds use
      // `display: false`) can be re-tessellated finer or coarser. Without it, rounds keep the chord
      // of the first draw at any zoom and their outlines sag off the surface.
      ...(own ? { detail: detailOf(kernel, visible, options ?? DEFAULT_TESSELLATION) } : {}),
      ...(await namesOf(kernel, visible, result.naming, faces)),
    };
  } finally {
    // A body made just for drawing is ours to dispose; the rebuild's body is not.
    if (!own) await kernel.dispose(visible);
  }
}

/**
 * Source for finer or coarser parts of the body (renderer `lod-body.ts`). Only for the rebuild's
 * own body, which lives until the next rebuild; a later request finds it gone and returns empty,
 * which the view reads as "not now".
 */
function detailOf(kernel: GeometryKernel, body: ShapeId, base: TessellationOptions): DetailSource {
  return {
    base,
    mesh: async (solids, options) => {
      const mesh = await kernel.tessellateSolids(body, solids, options);
      return mesh.ok ? mesh.value : null;
    },
    edges: async (solids, options) => {
      const edges = await kernel.extractSolidEdges(body, solids, options);
      return edges.ok ? edges.value : null;
    },
  };
}

/**
 * The name of each face of the body, in mesh index order. This is what makes a click resolve to a
 * reference. `Mesh.triangleFaces` holds positions in `describeFaces()`, the naming layer keys names
 * by face hash, and `faceHashes()` returns hashes in that same order, so the list lines up by
 * construction.
 *
 * A face without a name yields null rather than being skipped, which would shift every later entry.
 */
async function namesOf(
  kernel: GeometryKernel,
  body: import('@bezier/kernel').ShapeId,
  naming: import('@bezier/core').FaceNaming,
  known?: KernelResult<readonly FaceHash[]>,
): Promise<{
  faceRefs: readonly (StableRef | null)[];
  bodyRefs: readonly (readonly StableRef[])[];
}> {
  const faces = known ?? (await kernel.faceHashes(body));
  if (!faces.ok) return { faceRefs: [], bodyRefs: [] };

  const names = naming.names;
  // `readRef` caches parsed names; an assembly's 108,000 names were otherwise reparsed every
  // rebuild.
  const faceRefs = faces.value.map((hash) => {
    const name = names.get(hash);
    return name === undefined ? null : readRef(name);
  });
  const groups = await kernel.solidFaceGroups(body);
  const byHash = new Map(faces.value.map((hash, index) => [hash, faceRefs[index]]));
  const bodyRefs = groups.ok
    ? groups.value.map((group) =>
        group.map((hash) => byHash.get(hash)).filter((ref): ref is StableRef => ref != null),
      )
    : [];
  return { faceRefs, bodyRefs };
}

/**
 * The edges of a flat face as polylines in the face's sketch coordinates, for Project. Null when
 * the face is gone or not flat.
 */
export async function faceOutlineIn(
  kernel: GeometryKernel,
  result: RebuildResult,
  face: StableRef,
): Promise<readonly (readonly { x: number; y: number }[])[] | null> {
  const handle = await result.naming.resolve(kernel, face);
  if (handle === null) return null;
  const plane = await kernel.facePlane(handle);
  if (!plane.ok) return null;
  const basis = faceSketchBasis(plane.value.origin, plane.value.normal);
  const edges = await kernel.extractEdges(handle);
  if (!edges.ok) return null;
  const { positions, polylineStarts } = edges.value;
  const lines: { x: number; y: number }[][] = [];
  // `polylineStarts` are offsets into the float array, not point indices.
  for (let i = 0; i < polylineStarts.length; i += 1) {
    const from = polylineStarts[i] ?? 0;
    const to = polylineStarts[i + 1] ?? positions.length;
    const line: { x: number; y: number }[] = [];
    for (let at = from; at + 2 < to; at += 3) {
      const point = worldToPlane(basis, {
        x: positions[at] ?? 0,
        y: positions[at + 1] ?? 0,
        z: positions[at + 2] ?? 0,
      });
      line.push({ x: point.u, y: point.v });
    }
    if (line.length >= 2) lines.push(line);
  }
  return lines;
}

/**
 * Where the parts intersect a sketch plane, as polylines in sketch coordinates (external geometry
 * for Intersection). Empty when the plane misses.
 */
export async function sectionOutlineIn(
  kernel: GeometryKernel,
  result: RebuildResult,
  basis: PlaneBasis,
): Promise<readonly (readonly { x: number; y: number }[])[] | null> {
  if (result.body === null) return [];
  const cut = await kernel.sectionByPlane(result.body, basis);
  if (!cut.ok) return null;
  return cut.value.map((flat) => {
    const line: { x: number; y: number }[] = [];
    for (let at = 0; at + 2 < flat.length; at += 3) {
      const point = worldToPlane(basis, {
        x: flat[at] ?? 0,
        y: flat[at + 1] ?? 0,
        z: flat[at + 2] ?? 0,
      });
      line.push({ x: point.u, y: point.v });
    }
    return line;
  });
}

/**
 * The solid of the bodies these faces belong to, or the whole body when none are given. The caller
 * disposes the result when `owned` is true.
 */
export async function solidOf(
  kernel: GeometryKernel,
  result: RebuildResult,
  faces: readonly StableRef[] | null,
): Promise<{ shape: ShapeId; owned: boolean } | null> {
  if (result.body === null) return null;
  if (faces === null || faces.length === 0) return { shape: result.body, owned: false };
  const handles: ShapeId[] = [];
  for (const face of faces) {
    const handle = await result.naming.resolve(kernel, face);
    if (handle !== null) handles.push(handle);
  }
  if (handles.length === 0) return null;
  const parts = await kernel.partition(result.body, handles);
  if (!parts.ok) return null;
  if (parts.value.remainder !== null) await kernel.dispose(parts.value.remainder);
  return { shape: parts.value.selected, owned: true };
}

/** One named mesh per visible body (only those `faces` belong to, when given). */
export async function bodyMeshes(
  kernel: GeometryKernel,
  result: RebuildResult,
  document: CadDocument,
  faces: readonly StableRef[] | null,
  tolerance?: TessellationOptions,
): Promise<{ name: string; positions: Float32Array; indices: Uint32Array }[]> {
  if (result.body === null) return [];
  const listed = await listBodiesNamed(kernel, result.body, result.naming, document);
  if (listed.visible !== null && listed.visible !== result.body) {
    await kernel.dispose(listed.visible);
  }
  const wanted = faces === null ? null : new Set(faces.map(formatRef));
  const meshes: { name: string; positions: Float32Array; indices: Uint32Array }[] = [];
  for (const body of listed.bodies) {
    if (body.hidden) continue;
    if (wanted !== null && !body.faces.some((face) => wanted.has(formatRef(face)))) continue;
    const solid = await solidOf(kernel, result, body.faces);
    if (solid === null) continue;
    try {
      const mesh = await kernel.tessellate(solid.shape, tolerance);
      if (mesh.ok) {
        meshes.push({
          name: body.label,
          positions: mesh.value.positions,
          indices: mesh.value.indices,
        });
      }
    } finally {
      if (solid.owned) await kernel.dispose(solid.shape);
    }
  }
  return meshes;
}

/** Marks a face without its own colour (kernel `step-colors.ts`). */
const NO_COLOUR = 0xffffffff;

/**
 * Each drawn face's colour from imported files, or undefined when none had colours. Matched by
 * name, not position: an imported face is named `face-N` after its place in the file (`faceOrder:
 * 'file'`), the kernel keeps colours in that order, and names survive later edits.
 */
export async function importColoursOf(
  kernel: GeometryKernel,
  document: CadDocument,
  { faceRefs, bodyRefs, mesh }: Pick<DisplayGeometry, 'faceRefs' | 'bodyRefs' | 'mesh'>,
  known: Map<string, Uint32Array | null>,
): Promise<Uint32Array | undefined> {
  const byFeature = new Map<string, Uint32Array>();
  for (const feature of document.features) {
    const file = feature.params.file;
    if (feature.type !== 'import-step' || feature.params.faceOrder !== 'file') continue;
    if (typeof file !== 'string') continue;
    const key = textKey(file);
    let colours = known.get(key);
    if (colours === undefined) {
      let asked = await kernel.importColours(key);
      // Stored before colours were read: send the text once to read them.
      if (asked.ok && asked.value === undefined) asked = await kernel.importColours(key, file);
      colours = asked.ok ? (asked.value ?? null) : null;
      known.set(key, colours);
    }
    if (colours !== null) byFeature.set(feature.id, colours);
  }
  if (byFeature.size === 0) return undefined;

  const out = new Uint32Array(faceRefs.length).fill(NO_COLOUR);
  let any = false;
  faceRefs.forEach((ref, index) => {
    if (ref === null || ref.kind !== 'face' || !ref.tag.startsWith('face-')) return;
    const colours = byFeature.get(ref.feature);
    const colour = colours?.[Number(ref.tag.slice('face-'.length))];
    if (colour === undefined || colour === NO_COLOUR) return;
    out[index] = colour;
    any = true;
  });
  if (!any) return undefined;

  // A duplicate has new face names; it takes the colours of its original.
  colourCopies(out, document.features, faceRefs, bodyRefs ?? [], mesh);

  // Faces created by later edits inherit a colour, as in the source CAD program: a pull's faces
  // take the pulled face's colour, others (rounds, hole walls) the most common colour of their
  // part.
  const indexOf = new Map<string, number>();
  faceRefs.forEach((ref, index) => {
    if (ref !== null) indexOf.set(formatRef(ref), index);
  });
  const pulledFrom = new Map<string, number>();
  for (const feature of document.features) {
    const faces = feature.params.faces;
    const from = Array.isArray(faces) ? indexOf.get(String(faces[0])) : undefined;
    const colour = from === undefined ? undefined : out[from];
    if (colour !== undefined && colour !== NO_COLOUR) pulledFrom.set(feature.id, colour);
  }
  faceRefs.forEach((ref, index) => {
    const colour = ref?.kind === 'face' ? pulledFrom.get(ref.feature) : undefined;
    if (colour !== undefined && out[index] === NO_COLOUR) out[index] = colour;
  });
  for (const solid of bodyRefs ?? []) {
    const at = solid.map((ref) => indexOf.get(formatRef(ref)) ?? -1).filter((i) => i >= 0);
    const counts = new Map<number, number>();
    for (const i of at) {
      const colour = out[i];
      if (colour !== undefined && colour !== NO_COLOUR) {
        counts.set(colour, (counts.get(colour) ?? 0) + 1);
      }
    }
    const [usual] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (usual === undefined) continue;
    for (const i of at) if (out[i] === NO_COLOUR) out[i] = usual;
  }
  return out;
}
