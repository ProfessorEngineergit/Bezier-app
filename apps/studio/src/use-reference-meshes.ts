/**
 * The document's imported meshes, decoded for drawing. Decoded once per mesh and cached by feature
 * id: a scan is megabytes of text, and other edits return the same document entries.
 */

import type { CadDocument } from '@bezier/core';
import type { ReferenceMesh } from '@bezier/renderer';
import { useMemo, useRef } from 'react';
import { decodeMesh } from './formats/mesh-read.js';

export function useReferenceMeshes(document: CadDocument | null): readonly ReferenceMesh[] {
  const decoded = useRef(new Map<string, { text: string; mesh: ReferenceMesh }>());
  const features = document?.features;
  return useMemo(() => {
    const out: ReferenceMesh[] = [];
    const seen = new Set<string>();
    for (const feature of features ?? []) {
      if (feature.type !== 'reference-mesh' || feature.suppressed === true) continue;
      const text = feature.params.mesh;
      if (typeof text !== 'string') continue;
      seen.add(feature.id);
      const cached = decoded.current.get(feature.id);
      if (cached?.text === text) {
        out.push(cached.mesh);
        continue;
      }
      const mesh = { id: feature.id, positions: decodeMesh(text) };
      decoded.current.set(feature.id, { text, mesh });
      out.push(mesh);
    }
    for (const id of decoded.current.keys()) if (!seen.has(id)) decoded.current.delete(id);
    return out;
  }, [features]);
}
