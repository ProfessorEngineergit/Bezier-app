import type { SketchSurface } from '@bezier/core';
import type { Sketch, SketchId } from '@bezier/solver';
import { useEffect, useMemo, useRef } from 'react';
import { DimensionInput } from './DimensionInput.js';
import { px, setAttr, setStyle } from './dom-writes.js';
import { dimensionsOf, pendingDimensions } from './sketch-dimension-model.js';

interface ProjectionHandle {
  project(x: number, y: number, z: number): { x: number; y: number } | null;
  pointVisible(x: number, y: number, z: number): boolean;
}

interface SketchDimensionsProps {
  plane: SketchSurface;
  sketch: Sketch;
  pending: readonly { u: number; v: number }[];
  handleRef: React.RefObject<ProjectionHandle | null>;
  onChange?: (id: SketchId, length: number) => void;
  onCircleChange?: (id: SketchId, radius: number) => void;
  /** Changes a dimension that is its own constraint, by constraint id. */
  onConstraintChange?: (id: SketchId, value: number) => void;
}

/** Live dimension guides for the shape being drawn and committed lines. */
export function SketchDimensions({
  plane,
  sketch,
  pending,
  handleRef,
  onChange,
  onCircleChange,
  onConstraintChange,
}: SketchDimensionsProps) {
  const labels = useRef(new Map<string, HTMLDivElement>());
  const guides = useRef(new Map<string, SVGGElement>());
  const dimensions = useMemo(
    () => [...dimensionsOf(plane, sketch), ...pendingDimensions(plane, pending)],
    [plane, sketch, pending],
  );

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const handle = handleRef.current;
      if (handle === null) return;
      for (const dimension of dimensions) {
        const label = labels.current.get(dimension.id);
        const guide = guides.current.get(dimension.id);
        if (label === undefined || guide === undefined) continue;
        const start = handle.project(dimension.start.x, dimension.start.y, dimension.start.z);
        const end = handle.project(dimension.end.x, dimension.end.y, dimension.end.z);
        const reference = handle.project(
          dimension.reference.x,
          dimension.reference.y,
          dimension.reference.z,
        );
        if (start === null || end === null) {
          setStyle(label, 'visibility', 'hidden');
          setStyle(guide, 'visibility', 'hidden');
          continue;
        }
        setStyle(label, 'visibility', 'visible');
        setStyle(guide, 'visibility', 'visible');
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const screenLength = Math.hypot(dx, dy);
        if (screenLength < 1e-3) continue;
        const tangentX = dx / screenLength;
        const tangentY = dy / screenLength;
        let normalX = -tangentY;
        let normalY = tangentX;
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const away =
          reference === null
            ? -normalY
            : normalX * (midX - reference.x) + normalY * (midY - reference.y);
        if (away < 0) {
          normalX *= -1;
          normalY *= -1;
        }
        const offset = dimension.live === true ? 34 : 30;
        const startX = start.x + normalX * offset;
        const startY = start.y + normalY * offset;
        const endX = end.x + normalX * offset;
        const endY = end.y + normalY * offset;
        setStyle(label, 'left', px((startX + endX) / 2));
        setStyle(label, 'top', px((startY + endY) / 2));
        updateGuide(guide, {
          start,
          end,
          startOffset: { x: startX, y: startY },
          endOffset: { x: endX, y: endY },
          normal: { x: normalX, y: normalY },
          tangent: { x: tangentX, y: tangentY },
        });
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [dimensions, handleRef]);

  return (
    <div className="sketch-dimensions">
      {dimensions.map((dimension) => {
        const sourceId = dimension.sourceId;
        const change =
          dimension.isReference === true
            ? undefined
            : dimension.sourceKind === 'circle'
              ? onCircleChange === undefined
                ? undefined
                : (id: SketchId, diameter: number) => onCircleChange(id, diameter / 2)
              : dimension.sourceKind === 'constraint'
                ? onConstraintChange
                : onChange;
        return (
          <div className="sketch-dimension-set" key={dimension.id}>
            <svg aria-hidden="true" className="sketch-dimension__guide">
              <g
                ref={(element) => {
                  if (element === null) guides.current.delete(dimension.id);
                  else guides.current.set(dimension.id, element);
                }}
              >
                <line data-guide="start-extension" />
                <line data-guide="end-extension" />
                <line data-guide="dimension" />
                <polygon data-guide="start-arrow" />
                <polygon data-guide="end-arrow" />
              </g>
            </svg>
            <div
              className="sketch-dimension"
              data-live={dimension.live === true ? '' : undefined}
              ref={(element) => {
                if (element === null) labels.current.delete(dimension.id);
                else labels.current.set(dimension.id, element);
              }}
            >
              {dimension.prefix !== undefined && (
                <span className="sketch-dimension__unit">{dimension.prefix}</span>
              )}
              {sourceId === undefined || change === undefined ? (
                <span className="sketch-dimension__value">
                  {dimension.isReference === true
                    ? `(${trim(dimension.length)})`
                    : trim(dimension.length)}
                </span>
              ) : (
                <DimensionInput
                  label={`${dimension.sourceKind === 'circle' ? 'Diameter for sketch circle' : dimension.sourceKind === 'constraint' ? 'Value for sketch dimension' : 'Length for sketch line'} ${sourceId}`}
                  length={dimension.length}
                  onChange={(value) => change(sourceId, value)}
                />
              )}
              <span className="sketch-dimension__unit">mm</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface GuidePosition {
  start: { x: number; y: number };
  end: { x: number; y: number };
  startOffset: { x: number; y: number };
  endOffset: { x: number; y: number };
  normal: { x: number; y: number };
  tangent: { x: number; y: number };
}

function updateGuide(group: SVGGElement, position: GuidePosition): void {
  const startExtension = group.querySelector<SVGLineElement>('[data-guide="start-extension"]');
  const endExtension = group.querySelector<SVGLineElement>('[data-guide="end-extension"]');
  const dimension = group.querySelector<SVGLineElement>('[data-guide="dimension"]');
  const startArrow = group.querySelector<SVGPolygonElement>('[data-guide="start-arrow"]');
  const endArrow = group.querySelector<SVGPolygonElement>('[data-guide="end-arrow"]');
  if (
    startExtension === null ||
    endExtension === null ||
    dimension === null ||
    startArrow === null ||
    endArrow === null
  ) {
    return;
  }
  line(startExtension, position.start, {
    x: position.startOffset.x + position.normal.x * 7,
    y: position.startOffset.y + position.normal.y * 7,
  });
  line(endExtension, position.end, {
    x: position.endOffset.x + position.normal.x * 7,
    y: position.endOffset.y + position.normal.y * 7,
  });
  line(dimension, position.startOffset, position.endOffset);
  setAttr(
    startArrow,
    'points',
    arrow(position.startOffset, position.tangent.x, position.tangent.y, position.normal),
  );
  setAttr(
    endArrow,
    'points',
    arrow(position.endOffset, -position.tangent.x, -position.tangent.y, position.normal),
  );
}

function line(
  element: SVGLineElement,
  start: { x: number; y: number },
  end: { x: number; y: number },
): void {
  setAttr(element, 'x1', String(start.x));
  setAttr(element, 'y1', String(start.y));
  setAttr(element, 'x2', String(end.x));
  setAttr(element, 'y2', String(end.y));
}

function arrow(
  tip: { x: number; y: number },
  tangentX: number,
  tangentY: number,
  normal: { x: number; y: number },
): string {
  const depth = 7;
  const half = 3.2;
  const baseX = tip.x + tangentX * depth;
  const baseY = tip.y + tangentY * depth;
  return `${tip.x},${tip.y} ${baseX + normal.x * half},${baseY + normal.y * half} ${baseX - normal.x * half},${baseY - normal.y * half}`;
}

function trim(value: number): string {
  return String(Number(value.toFixed(2)));
}
