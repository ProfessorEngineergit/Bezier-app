/**
 * Object URLs for draft pictures, created and revoked as needed. Created in effects rather than
 * during render, since StrictMode's effect replay would otherwise revoke a URL still in use. A
 * picture keeps its URL while its bytes are in the draft.
 */

import { useEffect, useRef, useState } from 'react';
import type { Draft } from '../client/drafts.js';

export function useObjectUrls(images: Draft['images']): Record<string, string> {
  const held = useRef(new Map<Uint8Array, string>());
  const [, ask] = useState(0);

  useEffect(() => {
    const keep = new Set(Object.values(images).map((image) => image.bytes));
    for (const [bytes, url] of held.current) {
      if (keep.has(bytes)) continue;
      URL.revokeObjectURL(url);
      held.current.delete(bytes);
    }
    let added = false;
    for (const image of Object.values(images)) {
      if (held.current.has(image.bytes)) continue;
      held.current.set(
        image.bytes,
        URL.createObjectURL(new Blob([image.bytes as BlobPart], { type: image.mime })),
      );
      added = true;
    }
    if (added) ask((n) => n + 1);
  }, [images]);

  useEffect(() => {
    const mine = held.current;
    return () => {
      for (const url of mine.values()) URL.revokeObjectURL(url);
      mine.clear();
    };
  }, []);

  return Object.fromEntries(
    Object.entries(images).map(([key, image]) => [key, held.current.get(image.bytes) ?? '']),
  );
}
