import { formatRef } from '@bezier/core';
import type { DrawingProjection } from '@bezier/kernel';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session, SessionView } from '../session.js';
import { DrawingPaper } from './DrawingPaper.js';
import { detailView } from './drawing-detail.js';
import { layoutViews, type SheetView, sheetSize } from './drawing-sheet.js';
import type { DrawingSheet } from './drawing-sheets.js';
import { withDrawingSketches } from './drawing-sketches.js';
import { PhysicsLayer } from './PhysicsLayer.js';
import { physicsPreview } from './physics-layout.js';

const noop = () => undefined;
/** Each artboard keeps its own projections; changing the active sheet never moves the desk. */
export function DrawingInactiveSheet({
  sheet,
  session,
  model,
  revision,
  label,
  onLayout,
}: {
  sheet: DrawingSheet;
  session: Session | null;
  model: SessionView | null;
  revision: number;
  label: string;
  onLayout: (id: string, views: SheetView[]) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [views, setViews] = useState<DrawingProjection[]>([]);
  const bodies = model?.bodies ?? [];
  const included = sheet.bodies ?? bodies.filter((b) => !b.hidden).map((b) => b.key);
  const faces = bodies.filter((b) => included.includes(b.key)).flatMap((b) => b.faces.slice(0, 1));
  const faceKey = faces.map(formatRef).join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: faces is reconstructed; its stable text and revision identify the projection
  useEffect(() => {
    // A physics drawing has its pictures; there is nothing to project.
    if (session === null || sheet.physics !== undefined) return;
    let active = true;
    void session
      .drawingViews(sheet.section ?? undefined, faces)
      .then((value) => {
        if (active) setViews(value);
      })
      .catch(() => {
        if (active) setViews([]);
      });
    return () => {
      active = false;
    };
  }, [session, sheet.section, faceKey, revision, sheet.physics]);
  const layout = useMemo(() => {
    if (sheet.physics !== undefined) {
      const [w, h] = sheetSize(sheet.options.format);
      return physicsPreview(sheet.physics, w, h);
    }
    const projected = [...withDrawingSketches(views, model, sheet.sketches)];
    const top = views.find((v) => v.direction === 'top');
    const d = sheet.detail;
    if (d.on && top) projected.push(detailView(top, d.x, d.y, d.radius));
    return layoutViews(projected, sheet.options);
  }, [views, model, sheet.sketches, sheet.options, sheet.detail, sheet.physics]);
  useEffect(() => onLayout(sheet.id, layout), [onLayout, sheet.id, layout]);
  const [width, height] = sheetSize(sheet.options.format);
  return (
    <DrawingPaper
      callouts={{ section: sheet.section, detail: sheet.detail }}
      options={sheet.options}
      layout={layout}
      svg={svg}
      width={width}
      height={height}
      dimensioning={false}
      logo={sheet.logo}
      first={null}
      dimensionKind="aligned"
      sheetLabel={label}
      patch={noop}
      dimensions={sheet.dimensions}
      frames={sheet.frames}
      setFirst={noop}
      setDimensions={noop}
      extra={
        sheet.physics !== undefined && (
          <PhysicsLayer content={sheet.physics} height={height} width={width} />
        )
      }
    />
  );
}
