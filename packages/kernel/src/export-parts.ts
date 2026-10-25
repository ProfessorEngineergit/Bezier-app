/**
 * Exports an assembly a few parts at a time. Writing the whole Voron as STEP in one call ran out of
 * the engine's 4 GB, or ran silent long enough to be restarted as hung. Groups of a few thousand
 * faces keep each call short, and the texts are joined into one file. STL is meshed part by part
 * too, for the reason `tessellation.ts` gives.
 */
import type { StepPart } from './kernel.js';
import { meshPiece, type Piece, pieceBudgetMs, QUIET_MS, solidLeaves } from './tessellation.js';
import type { TessellationOptions } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

/** Faces per call: a few seconds of writing, a few hundred megabytes of the engine at most. */
const FACES_PER_GROUP = 4000;

function groupsOf(occt: RawKernel, leaves: readonly RawHandle[]): RawHandle[][] {
  const groups: RawHandle[][] = [];
  let current: RawHandle[] = [];
  let faces = 0;
  for (const leaf of leaves) {
    const count = occt.subShapeCount(leaf, 'face');
    if (current.length > 0 && faces + count > FACES_PER_GROUP) {
      groups.push(current);
      current = [];
      faces = 0;
    }
    current.push(leaf);
    faces += count;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** One silent-time allowance for the call plus the parts' own time, not one per part. */
function budgetOf(occt: RawKernel, parts: readonly RawHandle[]): number {
  return parts.reduce((sum, part) => sum + pieceBudgetMs(occt, part) - QUIET_MS, QUIET_MS);
}

/** What a part is called in the file, and its colour (0xRRGGBB), when the model gives one. */
export type PartName = (part: RawHandle) => { name: string; colour?: number } | null;

/** A solid is the part one of its faces belongs to. */
export function partsByFace(
  parts: readonly StepPart[],
  hashesOf: (solid: RawHandle) => readonly number[],
): PartName {
  const byFace = new Map<number, StepPart>();
  for (const part of parts) for (const face of part.faces) byFace.set(face, part);
  return (solid) => {
    for (const hash of hashesOf(solid)) {
      const part = byFace.get(hash);
      if (part !== undefined) return part;
    }
    return null;
  };
}

/** The parts as one XCAF document: each a product of its own, with its name and colour. */
function namedStep(occt: RawKernel, parts: readonly RawHandle[], nameOf: PartName): string {
  const doc = occt.createXCAFDocument();
  try {
    for (const part of parts) {
      const named = nameOf(part);
      const colour = named?.colour;
      doc.addShape(part, {
        ...(named === null ? {} : { name: named.name }),
        ...(colour === undefined
          ? {}
          : {
              color: [
                ((colour >> 16) & 255) / 255,
                ((colour >> 8) & 255) / 255,
                (colour & 255) / 255,
              ],
            }),
      });
    }
    return doc.exportSTEP();
  } finally {
    doc.close();
  }
}

/**
 * The STEP texts of the shape, one per group of parts, each written in its own short call. With
 * `nameOf`, each part keeps its name from the model (audit F-055).
 */
function stepTexts(
  occt: RawKernel,
  shape: RawHandle,
  alive: (budgetMs?: number) => void,
  nameOf?: PartName,
): string[] {
  const leaves = solidLeaves(occt, shape);
  const write = (parts: readonly RawHandle[], whole: RawHandle) =>
    nameOf === undefined ? occt.exportStep(whole) : namedStep(occt, parts, nameOf);
  if (leaves === null) {
    alive(pieceBudgetMs(occt, shape));
    return [write([shape], shape)];
  }
  try {
    const groups = groupsOf(occt, leaves);
    if (groups.length === 1) {
      alive(budgetOf(occt, leaves));
      return [write(leaves, shape)];
    }
    return groups.map((group) => {
      const compound = occt.makeCompound(group);
      try {
        alive(budgetOf(occt, group));
        return write(group, compound);
      } finally {
        occt.release(compound);
      }
    });
  } finally {
    for (const leaf of leaves) occt.release(leaf);
  }
}

export function exportStepInParts(
  occt: RawKernel,
  shape: RawHandle,
  alive: (budgetMs?: number) => void,
): string {
  const texts = stepTexts(occt, shape, alive);
  return texts.length === 1 ? (texts[0] as string) : joinStep(texts);
}

/** The file as bytes, encoded piece by piece: never one string, however large the assembly. */
export function exportStepFileInParts(
  occt: RawKernel,
  shape: RawHandle,
  alive: (budgetMs?: number) => void,
  nameOf?: PartName,
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks = stepPieces(stepTexts(occt, shape, alive, nameOf)).map((piece) =>
    encoder.encode(piece),
  );
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * Binary STL from the viewport's mesh, not OCCT's writer: the writer silently drops faces the
 * mesher fails on (holes in printed parts), while the viewport mesh has them repaired
 * (`mesh-mend.ts`).
 */
export function exportStlInParts(
  occt: RawKernel,
  shape: RawHandle,
  options: TessellationOptions,
  alive: (budgetMs?: number) => void,
): Uint8Array {
  const leaves = solidLeaves(occt, shape);
  if (leaves === null) {
    alive(pieceBudgetMs(occt, shape));
    return stlOf(meshPiece(occt, shape, options));
  }
  try {
    const parts = leaves.map((leaf) => {
      alive(pieceBudgetMs(occt, leaf));
      return stlOf(meshPiece(occt, leaf, options));
    });
    return joinStl(parts);
  } finally {
    for (const leaf of leaves) occt.release(leaf);
  }
}

/** One mesh as a binary STL: an 80-byte header, a 32-bit count, then 50 bytes a triangle. */
export function stlOf(piece: Piece): Uint8Array {
  const triangles = piece.indices.length / 3;
  const out = new Uint8Array(84 + triangles * 50);
  const view = new DataView(out.buffer);
  view.setUint32(80, triangles, true);
  const { positions: p, indices } = piece;
  let at = 84;
  for (let t = 0; t < triangles; t++) {
    const a = (indices[t * 3] ?? 0) * 3;
    const b = (indices[t * 3 + 1] ?? 0) * 3;
    const c = (indices[t * 3 + 2] ?? 0) * 3;
    const ux = (p[b] ?? 0) - (p[a] ?? 0);
    const uy = (p[b + 1] ?? 0) - (p[a + 1] ?? 0);
    const uz = (p[b + 2] ?? 0) - (p[a + 2] ?? 0);
    const vx = (p[c] ?? 0) - (p[a] ?? 0);
    const vy = (p[c + 1] ?? 0) - (p[a + 1] ?? 0);
    const vz = (p[c + 2] ?? 0) - (p[a + 2] ?? 0);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    view.setFloat32(at, nx / length, true);
    view.setFloat32(at + 4, ny / length, true);
    view.setFloat32(at + 8, nz / length, true);
    for (const [slot, v] of [a, b, c].entries()) {
      view.setFloat32(at + 12 + slot * 12, p[v] ?? 0, true);
      view.setFloat32(at + 16 + slot * 12, p[v + 1] ?? 0, true);
      view.setFloat32(at + 20 + slot * 12, p[v + 2] ?? 0, true);
    }
    at += 50;
  }
  return out;
}

/**
 * Binary STL files as one: the first header, the sum of the triangle counts, every file's triangles
 * one after another (an 80-byte header, a 32-bit count, then 50 bytes a triangle).
 */
export function joinStl(parts: readonly Uint8Array[]): Uint8Array {
  let triangles = 0;
  for (const part of parts)
    triangles += new DataView(part.buffer, part.byteOffset).getUint32(80, true);
  const out = new Uint8Array(84 + triangles * 50);
  const first = parts[0];
  if (first !== undefined) out.set(first.subarray(0, 80), 0);
  new DataView(out.buffer).setUint32(80, triangles, true);
  let at = 84;
  for (const part of parts) {
    const body = part.subarray(84);
    out.set(body, at);
    at += body.length;
  }
  return out;
}

/**
 * Joins STEP files: the first header, then every file's entities renumbered to be unique. Each
 * keeps its own product, giving several top-level parts. A `#` inside a quoted name is not a
 * reference.
 */
export function joinStep(texts: readonly string[]): string {
  return stepPieces(texts).join('');
}

/** The pieces of the joined file in order, so a caller can encode them without joining them. */
function stepPieces(texts: readonly string[]): string[] {
  if (texts.length === 1) return [texts[0] as string];
  const pieces: string[] = [];
  let offset = 0;
  for (const text of texts) {
    const start = text.indexOf('DATA;');
    const end = text.lastIndexOf('ENDSEC;');
    if (start < 0 || end < start) throw new Error('A part was written without its data section.');
    if (pieces.length === 0) pieces.push(`${text.slice(0, start)}DATA;`);
    let highest = 0;
    pieces.push(
      renumber(text.slice(start + 'DATA;'.length, end), (id) => {
        highest = Math.max(highest, id);
        return id + offset;
      }),
    );
    offset += highest;
  }
  pieces.push('ENDSEC;\nEND-ISO-10303-21;\n');
  return pieces;
}

function renumber(body: string, map: (id: number) => number): string {
  // Split at quotes, the pieces outside them are the even ones; a doubled quote inside a name
  // ('') splits into an empty piece and keeps the count right.
  return body
    .split("'")
    .map((piece, index) =>
      index % 2 === 0 ? piece.replace(/#(\d+)/g, (_, id: string) => `#${map(Number(id))}`) : piece,
    )
    .join("'");
}
