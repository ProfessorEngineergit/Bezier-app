/**
 * Reads STL (text or binary) and OBJ into a triangle soup: nine floats per triangle, file units
 * taken as millimetres. Meshes are references, not solids (`features/reference-mesh.ts` in core).
 */

export type MeshRead = { ok: true; positions: Float32Array } | { ok: false; message: string };

/** Big enough for a detailed scan, small enough to keep a project file sensible. */
export const MAX_TRIANGLES = 400_000;

function tooBig(count: number): MeshRead {
  return {
    ok: false,
    message: `This mesh has ${count.toLocaleString('en')} triangles; the limit is ${MAX_TRIANGLES.toLocaleString('en')}. Simplify it first.`,
  };
}

function readStl(bytes: Uint8Array): MeshRead {
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.byteLength, 512)));
  // Text starts "solid" and has "facet" (or, empty, "endsolid") soon after; a binary header may
  // start "solid" too but is never followed by those words.
  if (head.trimStart().startsWith('solid') && /facet|endsolid/.test(head)) {
    const numbers: number[] = [];
    for (const match of new TextDecoder()
      .decode(bytes)
      .matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) {
      numbers.push(Number(match[1]), Number(match[2]), Number(match[3]));
    }
    if (numbers.length % 9 !== 0 || numbers.some((n) => !Number.isFinite(n))) {
      return { ok: false, message: 'This STL file is damaged: a triangle is incomplete.' };
    }
    if (numbers.length / 9 > MAX_TRIANGLES) return tooBig(numbers.length / 9);
    return { ok: true, positions: new Float32Array(numbers) };
  }
  if (bytes.byteLength < 84) return { ok: false, message: 'This STL file is empty.' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Bounded by the bytes actually there: some writers leave a few bytes after the last triangle,
  // and a damaged count must not read past the end.
  const count = Math.min(view.getUint32(80, true), Math.floor((bytes.byteLength - 84) / 50));
  if (count > MAX_TRIANGLES) return tooBig(count);
  const positions = new Float32Array(count * 9);
  for (let t = 0; t < count; t += 1) {
    for (let i = 0; i < 9; i += 1) {
      positions[t * 9 + i] = view.getFloat32(84 + t * 50 + 12 + i * 4, true);
    }
  }
  return { ok: true, positions };
}

function readObj(text: string): MeshRead {
  const vertices: number[] = [];
  const out: number[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.split(/\s+/);
      vertices.push(Number(x), Number(y), Number(z));
    } else if (line.startsWith('f ')) {
      // "f 1 2 3", "f 1/1/1 2/2/2 3/3/3", negative indices count from the end.
      const corners = line
        .split(/\s+/)
        .slice(1)
        .map((token) => {
          const index = Number.parseInt(token.split('/')[0] ?? '', 10);
          return index < 0 ? vertices.length / 3 + index : index - 1;
        });
      // A polygon becomes a fan of triangles from its first corner.
      for (let i = 1; i + 1 < corners.length; i += 1) {
        for (const corner of [corners[0], corners[i], corners[i + 1]]) {
          if (corner === undefined || corner < 0 || corner * 3 + 2 >= vertices.length) {
            return { ok: false, message: 'This OBJ file refers to a point it does not have.' };
          }
          out.push(
            vertices[corner * 3] ?? 0,
            vertices[corner * 3 + 1] ?? 0,
            vertices[corner * 3 + 2] ?? 0,
          );
        }
      }
    }
  }
  if (out.length / 9 > MAX_TRIANGLES) return tooBig(out.length / 9);
  return { ok: true, positions: new Float32Array(out) };
}

export function readMesh(name: string, bytes: Uint8Array): MeshRead {
  const lower = name.toLowerCase();
  const result = lower.endsWith('.obj') ? readObj(new TextDecoder().decode(bytes)) : readStl(bytes);
  if (result.ok && result.positions.length === 0) {
    return { ok: false, message: 'This file holds no triangles.' };
  }
  return result;
}

/** A triangle soup as text for the document, and back. Little-endian floats in base64. */
export function encodeMesh(positions: Float32Array): string {
  const bytes = new Uint8Array(positions.byteLength);
  const view = new DataView(bytes.buffer);
  positions.forEach((value, i) => {
    view.setFloat32(i * 4, value, true);
  });
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function decodeMesh(text: string): Float32Array {
  const binary = atob(text);
  const view = new DataView(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) view.setUint8(i, binary.charCodeAt(i));
  const positions = new Float32Array(Math.floor(binary.length / 4));
  for (let i = 0; i < positions.length; i += 1) positions[i] = view.getFloat32(i * 4, true);
  return positions;
}
