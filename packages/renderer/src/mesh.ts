/**
 * Kernel tessellation to Three.js geometry, sharing the kernel's typed arrays without copying
 * (ADR 0007). Also builds the face-to-vertex index used for highlighting.
 */

import type { Mesh } from '@bezier/kernel';
import { BufferAttribute, BufferGeometry, Color } from 'three';

/** Vertices per face, as one flat array plus offsets to avoid an allocation per face. */
export interface FaceVertices {
  /** Vertex indices, grouped by face. */
  vertices: Uint32Array;
  /** Where each face's run begins. Length is `faceCount + 1`; the last entry ends it. */
  offsets: Uint32Array;
  faceCount: number;
}

/**
 * A geometry that shares the kernel's buffers. `color` is the exception: it is ours, written by the
 * highlight layer, and starts as the base surface colour.
 */
export function buildGeometry(
  mesh: Mesh,
  base: readonly [number, number, number],
  faceColours?: Float32Array,
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));

  const vertexCount = mesh.positions.length / 3;
  const colors = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    colors[i * 3] = base[0];
    colors[i * 3 + 1] = base[1];
    colors[i * 3 + 2] = base[2];
  }
  if (faceColours !== undefined) {
    // Each triangle's corners take its face's colour. OCCT gives every face vertices of its own, so
    // a corner never belongs to two faces.
    for (let t = 0; t < mesh.triangleFaces.length; t++) {
      const face = (mesh.triangleFaces[t] ?? 0) * 3;
      for (let k = 0; k < 3; k++) {
        const vertex = (mesh.indices[t * 3 + k] ?? 0) * 3;
        colors[vertex] = faceColours[face] ?? base[0];
        colors[vertex + 1] = faceColours[face + 1] ?? base[1];
        colors[vertex + 2] = faceColours[face + 2] ?? base[2];
      }
    }
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('faceBias', faceBiases(mesh));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));

  return geometry;
}

/**
 * A small per-face depth step, one of sixteen, read by `body-material.ts`, so coplanar faces of
 * touching parts resolve consistently instead of z-fighting. Steps are scattered, not sequential,
 * so faces of different parts that touch rarely share a step.
 */
function faceBiases(mesh: Mesh): BufferAttribute {
  const steps = new Uint8Array(mesh.positions.length / 3);
  for (let t = 0; t < mesh.triangleFaces.length; t++) {
    const step = (((mesh.triangleFaces[t] ?? 0) * 7919) % 16) * 17;
    for (let k = 0; k < 3; k++) steps[mesh.indices[t * 3 + k] ?? 0] = step;
  }
  return new BufferAttribute(steps, 1, true);
}

/**
 * Inverts `triangleFaces` into face → vertices in two passes (count, then fill) to avoid
 * allocating per face. A vertex shared by two faces lands in both runs.
 */
export function indexFaceVertices(mesh: Mesh): FaceVertices {
  const triangles = mesh.triangleFaces.length;

  let faceCount = 0;
  for (let t = 0; t < triangles; t++) {
    const face = mesh.triangleFaces[t] ?? 0;
    if (face + 1 > faceCount) faceCount = face + 1;
  }

  const counts = new Uint32Array(faceCount + 1);
  for (let t = 0; t < triangles; t++) {
    const face = mesh.triangleFaces[t] ?? 0;
    counts[face] = (counts[face] ?? 0) + 3;
  }

  const offsets = new Uint32Array(faceCount + 1);
  let running = 0;
  for (let face = 0; face < faceCount; face++) {
    offsets[face] = running;
    running += counts[face] ?? 0;
  }
  offsets[faceCount] = running;

  const cursor = Uint32Array.from(offsets.subarray(0, faceCount));
  const vertices = new Uint32Array(running);
  for (let t = 0; t < triangles; t++) {
    const face = mesh.triangleFaces[t] ?? 0;
    let at = cursor[face] ?? 0;
    vertices[at++] = mesh.indices[t * 3] ?? 0;
    vertices[at++] = mesh.indices[t * 3 + 1] ?? 0;
    vertices[at++] = mesh.indices[t * 3 + 2] ?? 0;
    cursor[face] = at;
  }

  return { vertices, offsets, faceCount };
}

/** File face colours (0xRRGGBB, sRGB) as linear floats, three per face; default where unset. */
export function linearColours(
  hex: Uint32Array,
  base: readonly [number, number, number],
): Float32Array {
  const out = new Float32Array(hex.length * 3);
  const colour = new Color();
  hex.forEach((value, face) => {
    if (value > 0xffffff) {
      out.set(base, face * 3);
      return;
    }
    // `setHex` reads sRGB and stores linear, which is what vertex colours are.
    colour.setHex(value);
    out[face * 3] = colour.r;
    out[face * 3 + 1] = colour.g;
    out[face * 3 + 2] = colour.b;
  });
  return out;
}
