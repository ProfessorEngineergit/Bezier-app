/**
 * Human-readable references: "Import · face 6", "Extrude 2 · end face", "edge of Extrude · side 1
 * and end face". The canonical form (`F:import-1792261388964:face-6`) is stored in files and kept
 * as the title (audit F-012).
 */
import type { FaceRef, StableRef } from '@bezier/core';

function tagWords(tag: string): string {
  if (tag === 'start') return 'start face';
  if (tag === 'end') return 'end face';
  return tag.replace(/-/g, ' ');
}

function faceWords(ref: FaceRef, nameOf: (feature: string) => string | undefined): string {
  return `${nameOf(ref.feature) ?? ref.feature} · ${tagWords(ref.tag)}`;
}

export function refLabel(ref: StableRef, nameOf: (feature: string) => string | undefined): string {
  if (ref.kind === 'face') return faceWords(ref, nameOf);
  const [first, ...rest] = ref.faces;
  if (first === undefined) return ref.kind;
  const others = rest.map((face) => tagWords(face.tag));
  const kind = ref.kind === 'edge' ? 'Edge' : 'Corner';
  return `${kind} of ${faceWords(first, nameOf)}${others.length > 0 ? ` and ${others.join(', ')}` : ''}`;
}
