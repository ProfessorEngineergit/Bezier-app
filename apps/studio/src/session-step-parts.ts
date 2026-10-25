/**
 * Body names as written to STEP: each body's name and the face hashes that identify its solid, so
 * names survive a STEP round trip (audit F-055).
 */

import { type CadDocument, formatRef, type RebuildResult } from '@bezier/core';
import type { FaceHash, GeometryKernel, StepPart } from '@bezier/kernel';
import { listBodiesNamed } from './import-part-names.js';

export async function stepParts(
  kernel: GeometryKernel,
  rebuilt: RebuildResult,
  document: CadDocument,
): Promise<StepPart[] | undefined> {
  const body = rebuilt.body;
  if (body === null) return undefined;
  const listed = await listBodiesNamed(kernel, body, rebuilt.naming, document);
  // Only names are needed; the visible-only body made for drawing is disposed.
  if (listed.visible !== null && listed.visible !== body) await kernel.dispose(listed.visible);
  const hashes = new Map<string, FaceHash[]>();
  for (const [hash, name] of rebuilt.naming.names)
    hashes.set(name, [...(hashes.get(name) ?? []), hash]);
  return listed.bodies.map((body) => ({
    name: body.label,
    faces: body.faces.flatMap((face) => hashes.get(formatRef(face)) ?? []),
  }));
}
