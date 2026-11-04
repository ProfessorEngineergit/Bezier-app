/**
 * Where a section view cuts: a plane square to one axis, and which side of it stays. Display only;
 * the GPU's clipping, the caps and picking all read this, so they agree on what can be seen.
 */

export type SectionAxis = 'x' | 'y' | 'z';

export interface SectionCut {
  axis: SectionAxis;
  /** Where along the axis, in millimetres. */
  at: number;
  /** Keeps the side above the plane instead of the one below it. */
  flip: boolean;
}

type Point = { readonly x: number; readonly y: number; readonly z: number };

/** The way the cut-away side lies from the plane: 1 along the axis, -1 against it. */
export const awaySign = (cut: SectionCut): 1 | -1 => (cut.flip ? -1 : 1);

/** How far past the plane a point lies, on the cut-away side; negative on the kept side. */
export const pastCut = (cut: SectionCut, point: Point): number =>
  awaySign(cut) * (point[cut.axis] - cut.at);
