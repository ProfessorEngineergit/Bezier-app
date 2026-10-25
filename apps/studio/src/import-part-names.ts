/**
 * Part names from STEP files, for Items rows and export parts. Read once at import
 * (`kernel/step-colors.ts`) and stored with the file; this looks them up by file key and maps face
 * numbers to parts.
 */

import { type CadDocument, type FaceNaming, listBodies, type PartNames } from '@bezier/core';
import { type GeometryKernel, type ShapeId, textKey } from '@bezier/kernel';

interface Known {
  names: (string | null)[];
  /** Where each solid's faces begin in the file's face numbering. */
  starts: number[];
}

/** Per kernel, per file key: fetched once; null when the file names nothing. */
const known = new WeakMap<GeometryKernel, Map<string, Known | null>>();

async function namesOf(kernel: GeometryKernel, key: string): Promise<Known | null> {
  let cache = known.get(kernel);
  if (cache === undefined) {
    cache = new Map();
    known.set(kernel, cache);
  }
  const have = cache.get(key);
  if (have !== undefined) return have;
  // Only names stored at import. Files stored before names were read are not re-parsed for them:
  // that would send the whole text (241 MB for the Voron) to the worker on every open. They get
  // names when imported again.
  const asked = await kernel.importNames(key);
  const value = asked.ok ? (asked.value ?? null) : null;
  let total = 0;
  const result =
    value === null
      ? null
      : {
          names: value.names,
          starts: value.faces.map((count) => {
            const start = total;
            total += count;
            return start;
          }),
        };
  cache.set(key, result);
  return result;
}

/** Part names of every import in the document named in file order, or undefined. */
export async function partNamesFor(
  kernel: GeometryKernel,
  document: CadDocument,
): Promise<PartNames | undefined> {
  const byFeature = new Map<string, Known>();
  for (const feature of document.features) {
    const file = feature.params.file;
    if (feature.type !== 'import-step' || feature.params.faceOrder !== 'file') continue;
    if (typeof file !== 'string') continue;
    const names = await namesOf(kernel, textKey(file));
    if (names !== null) byFeature.set(feature.id, names);
  }
  if (byFeature.size === 0) return undefined;
  return (feature, face) => {
    const part = byFeature.get(feature);
    if (part === undefined) return null;
    // The last solid that starts at or before the face.
    let low = 0;
    let high = part.starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((part.starts[middle] ?? 0) <= face) low = middle;
      else high = middle - 1;
    }
    return part.names[low] ?? null;
  };
}

/** `listBodies` with parts named as their files name them. */
export async function listBodiesNamed(
  kernel: GeometryKernel,
  body: ShapeId,
  naming: FaceNaming,
  document: CadDocument,
) {
  return listBodies(kernel, body, naming, document, await partNamesFor(kernel, document));
}
