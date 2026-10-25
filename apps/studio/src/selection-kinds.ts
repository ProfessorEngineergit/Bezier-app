/** What the move key can grab besides bodies: a sketch or an image. */

import type { CadDocument } from '@bezier/core';

export function isPlacedFeature(
  document: CadDocument | null | undefined,
  id: string | null,
): boolean {
  return (
    document?.features.some(
      (feature) =>
        feature.id === id && (feature.type === 'sketch' || feature.type === 'reference-image'),
    ) ?? false
  );
}
