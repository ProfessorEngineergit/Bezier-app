import type { Sketch } from '@bezier/solver';
import { type Docking, type Point2D, snapCandidate, snapSketchPoint } from '@bezier/ui';
import { useMemo, useRef } from 'react';

/**
 * Snapping aware of other sketches in the plane (`sketch-docking.ts`), with the drawing tools'
 * signatures. The other sketches are read on pointer move, so the returned functions are stable.
 */
export function useDockedSnap(docking: Docking) {
  const dock = useRef(docking);
  dock.current = docking;
  return useMemo(
    () => ({
      snapSketchPoint: (sketch: Sketch, at: Point2D, within: number, grid: number | null) =>
        snapSketchPoint(sketch, at, within, grid, dock.current),
      snapCandidate: (sketch: Sketch, at: Point2D, within: number, grid: number | null) =>
        snapCandidate(sketch, at, within, grid, dock.current),
    }),
    [],
  );
}
