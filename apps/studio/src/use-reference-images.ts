/**
 * The document's images, decoded for drawing. Stored as small base64 files, decoded once off the
 * main thread (`createImageBitmap`) and cached by feature id while the bytes are unchanged, so
 * moves, resizes and other edits never decode again.
 */

import type { CadDocument } from '@bezier/core';
import type { ReferenceImage } from '@bezier/renderer';
import { useEffect, useMemo, useRef, useState } from 'react';
import { imageBasis } from './image/image-basis.js';
import { fromBase64 } from './image/image-read.js';
import { placementOf } from './image/placement.js';
import { useReferenceMeshes } from './use-reference-meshes.js';

interface Decoded {
  data: string;
  bitmap: ImageBitmap;
}

export function useReferenceImages(document: CadDocument | null): readonly ReferenceImage[] {
  const decoded = useRef(new Map<string, Decoded>());
  // Bumped when an image finishes decoding, so the list below is recomputed.
  const [ready, setReady] = useState(0);
  const features = document?.features;

  useEffect(() => {
    let live = true;
    const wanted = new Set<string>();
    for (const feature of features ?? []) {
      if (feature.type !== 'reference-image') continue;
      wanted.add(feature.id);
      const data = feature.params.image;
      if (typeof data !== 'string') continue;
      if (decoded.current.get(feature.id)?.data === data) continue;
      const mime = typeof feature.params.mime === 'string' ? feature.params.mime : '';
      void createImageBitmap(new Blob([fromBase64(data)], mime === '' ? {} : { type: mime }))
        .then((bitmap) => {
          const kept = decoded.current.get(feature.id);
          if (!live || kept?.data === data) {
            bitmap.close();
            return;
          }
          kept?.bitmap.close();
          decoded.current.set(feature.id, { data, bitmap });
          setReady((count) => count + 1);
        })
        .catch(() => undefined);
    }
    // Release images no longer in the document.
    for (const [id, picture] of decoded.current)
      if (!wanted.has(id)) {
        picture.bitmap.close();
        decoded.current.delete(id);
      }
    return () => {
      live = false;
    };
  }, [features]);

  // Release everything when the project closes.
  useEffect(() => {
    const kept = decoded.current;
    return () => {
      for (const picture of kept.values()) picture.bitmap.close();
      kept.clear();
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `ready` is what says a picture arrived
  return useMemo(() => {
    const out: ReferenceImage[] = [];
    for (const feature of features ?? []) {
      if (feature.type !== 'reference-image' || feature.suppressed === true) continue;
      const picture = decoded.current.get(feature.id);
      if (picture === undefined || picture.data !== feature.params.image) continue;
      const basis = imageBasis(feature.params);
      if (basis === null) continue;
      const opacity = typeof feature.params.opacity === 'number' ? feature.params.opacity : 0.8;
      out.push({
        id: feature.id,
        source: picture.bitmap,
        basis,
        placement: placementOf(feature.params),
        opacity,
      });
    }
    return out;
  }, [features, ready]);
}

/** Meshes and images placed to model against, as the viewport draws them. */
export function useReferences(document: CadDocument | null) {
  return { references: useReferenceMeshes(document), images: useReferenceImages(document) };
}
