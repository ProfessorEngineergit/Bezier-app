/**
 * Marks where a section and a detail come from on their source views: the cutting plane on the
 * front view with arrows and letters, and a lettered circle on the top view (audit F-020).
 *
 * In sheet millimetres, from the laid-out views. A section is a horizontal cut through the part
 * (`sectionBrep`, at a fraction of its height) seen from above, so on the front view it is a
 * horizontal line at that fraction; a detail circle is in the top view's coordinates, tied to the
 * sheet through a model vertex's position on it.
 */

import { viewBounds } from './drawing-dimensions.js';
import type { SheetView } from './drawing-sheet.js';

export interface SectionCallout {
  /** The cutting line, past the view on both sides. */
  from: [number, number];
  to: [number, number];
  /** Arrows at both ends point in the viewing direction: down onto the cut. */
  arrow: number;
}

export interface DetailCallout {
  centre: [number, number];
  radius: number;
}

/** How far the cutting line reaches past the view, in sheet millimetres. */
const OVERHANG = 6;

export function sectionCallout(layout: readonly SheetView[], fraction: number | null) {
  if (fraction === null) return null;
  const front = layout.find((view) => view.name === 'front');
  const box = front === undefined ? null : viewBounds(front);
  if (box === null) return null;
  // The sheet's y runs down and the part's height up.
  const y = box.maxY - fraction * (box.maxY - box.minY);
  return {
    from: [box.minX - OVERHANG, y],
    to: [box.maxX + OVERHANG, y],
    arrow: 5,
  } satisfies SectionCallout;
}

export function detailCallout(
  layout: readonly SheetView[],
  detail: { on: boolean; x: number; y: number; radius: number },
): DetailCallout | null {
  if (!detail.on) return null;
  const top = layout.find((view) => view.name === 'top');
  const anchor = top?.vertices[0];
  if (top === undefined || anchor === undefined) return null;
  // The top view looks down Z with X to the right, so its own coordinates are the model's X and Y.
  return {
    centre: [
      anchor.point[0] + (detail.x - anchor.world.x) * top.scale,
      anchor.point[1] - (detail.y - anchor.world.y) * top.scale,
    ],
    radius: detail.radius * top.scale,
  };
}
