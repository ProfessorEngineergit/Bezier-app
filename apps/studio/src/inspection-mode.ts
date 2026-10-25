export type InspectionMode = 'measure' | 'section';

/** The active inspection tool; the one that owns viewport clicks wins. */
export function inspectionMode(measuring: boolean, section: number | null): InspectionMode | null {
  if (measuring) return 'measure';
  return section === null ? null : 'section';
}

/** Toggles a section through the current model centre. */
export function toggleSection(current: number | null, contentZ: number | undefined): number | null {
  return current === null ? (contentZ ?? 0) : null;
}
