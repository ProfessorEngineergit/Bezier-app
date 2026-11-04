import type { SectionCut } from '@bezier/renderer';
import type { ViewSettings } from '@bezier/ui';

export type InspectionMode = 'measure' | 'section';

/** The active inspection tool; the one that owns viewport clicks wins. */
export function inspectionMode(measuring: boolean, section: number | null): InspectionMode | null {
  if (measuring) return 'measure';
  return section === null ? null : 'section';
}

/** The section as the viewport takes it, or null when not sectioning. */
export function sectionCut(settings: ViewSettings): SectionCut | null {
  const { section, sectionAxis, sectionFlip } = settings;
  return section === null ? null : { axis: sectionAxis, at: section, flip: sectionFlip };
}

/** Toggles a section through the current model centre. */
export function toggleSection(current: number | null, contentZ: number | undefined): number | null {
  return current === null ? (contentZ ?? 0) : null;
}
