import type { Stretch } from '../format/timeline.js';

/** The timeline selection, shown in the inspector. */
export type Selection =
  | { kind: 'clip'; index: number }
  | { kind: 'gap'; stretch: Stretch }
  | { kind: 'chapter'; index: number }
  | { kind: 'zoom'; index: number }
  | null;

export const sameSelection = (a: Selection, b: Selection): boolean => {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'gap' && b.kind === 'gap')
    return a.stretch.start === b.stretch.start && a.stretch.end === b.stretch.end;
  return 'index' in a && 'index' in b && a.index === b.index;
};

/** The In and Out points marking a stretch to act on. */
export interface TrimPoints {
  in: number | null;
  out: number | null;
}
