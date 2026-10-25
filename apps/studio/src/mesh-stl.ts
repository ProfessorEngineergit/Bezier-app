/** Imported meshes as binary STL, and joining STL files into one (audit F-005). */
import type { CadDocument } from '@bezier/core';
import { decodeMesh } from './formats/mesh-read.js';

/** Every visible reference mesh as triangles, nine floats each. */
export function referenceTriangles(document: CadDocument): Float32Array[] {
  return document.features.flatMap((feature) =>
    feature.type === 'reference-mesh' &&
    feature.suppressed !== true &&
    typeof feature.params.mesh === 'string'
      ? [decodeMesh(feature.params.mesh)]
      : [],
  );
}

/** Binary STL of loose triangles (nine floats each); normals left for the reader to compute. */
export function trianglesStl(parts: readonly Float32Array[]): Uint8Array {
  const count = parts.reduce((sum, p) => sum + Math.floor(p.length / 9), 0);
  const out = new Uint8Array(84 + count * 50);
  const view = new DataView(out.buffer);
  view.setUint32(80, count, true);
  let at = 84;
  for (const part of parts) {
    for (let t = 0; t + 9 <= part.length; t += 9) {
      at += 12;
      for (let k = 0; k < 9; k += 1) {
        view.setFloat32(at, part[t + k] ?? 0, true);
        at += 4;
      }
      at += 2;
    }
  }
  return out;
}

/** Joins binary STL files: triangle counts summed, triangles concatenated. */
export function joinStl(parts: readonly Uint8Array[]): Uint8Array {
  const count = parts.reduce(
    (sum, p) => sum + new DataView(p.buffer, p.byteOffset).getUint32(80, true),
    0,
  );
  const out = new Uint8Array(84 + count * 50);
  new DataView(out.buffer).setUint32(80, count, true);
  let at = 84;
  for (const part of parts) {
    out.set(part.subarray(84), at);
    at += part.length - 84;
  }
  return out;
}
