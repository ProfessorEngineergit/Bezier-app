import { planeToWorld } from '@bezier/core';
import type { DrawingProjection } from '@bezier/kernel';
import { sampleCurve } from '@bezier/ui';
import type { SessionView } from '../session.js';
import { sketchFromFeature } from '../visible-sketch.js';

/** Selected sketches are explicit drawing geometry, on the same projector axes as OCCT HLR. */
export function withDrawingSketches(
  views: DrawingProjection[],
  model: SessionView | null,
  ids: readonly string[],
): DrawingProjection[] {
  if (model === null || ids.length === 0) return views;
  const all =
    views.length > 0
      ? views
      : (['front', 'top', 'right', 'isometric'] as const).map((direction) => ({
          direction,
          visible: [],
          hidden: [],
        }));
  return all.map((view) => {
    if (view.direction === 'section' || view.direction === 'detail') return view;
    const lines: number[][] = [];
    for (const id of ids) {
      const feature = model.document.features.find((f) => f.id === id);
      const source =
        feature === undefined || feature.suppressed ? null : sketchFromFeature(feature);
      const basis = model.sketches.get(id)?.basis;
      if (source === null || basis === undefined) continue;
      const points = new Map(
        source.sketch.primitives.filter((p) => p.kind === 'point').map((p) => [p.id, p]),
      );
      for (const primitive of source.sketch.primitives) {
        if (primitive.kind === 'point' || primitive.construction) continue;
        const a = primitive.kind === 'line' ? points.get(primitive.start) : undefined;
        const b = primitive.kind === 'line' ? points.get(primitive.end) : undefined;
        const path =
          primitive.kind !== 'line'
            ? sampleCurve(source.sketch, primitive, 192)
            : a !== undefined && b !== undefined
              ? [
                  { u: a.x, v: a.y },
                  { u: b.x, v: b.y },
                ]
              : [];
        const line: number[] = [];
        for (const at of path) {
          const p = planeToWorld(basis, at.u, at.v);
          if (view.direction === 'top') line.push(p.x, p.y);
          else if (view.direction === 'front') line.push(p.x, p.z);
          else if (view.direction === 'right') line.push(p.y, p.z);
          else line.push((p.x + p.y) / Math.SQRT2, (-p.x + p.y + 2 * p.z) / Math.sqrt(6));
        }
        if (line.length >= 4) lines.push(line);
      }
    }
    return { ...view, visible: [...view.visible, ...lines] };
  });
}
