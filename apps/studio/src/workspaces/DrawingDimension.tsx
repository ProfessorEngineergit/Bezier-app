/** Movable vector dimensions with white text clearance, direct editing and keyboard placement. */
import { useEffect, useRef } from 'react';
import { dimensionAxes, dimensionGeometry } from './drawing-dimensions.js';
import type { SheetDimension } from './drawing-sheet.js';
import { EditableDrawingText } from './EditableDrawingText.js';

const INK = '#1f2830';
export function DrawingDimension({
  d,
  offset,
  index,
  onChange,
  onRemove,
}: {
  d: SheetDimension;
  offset: number;
  index: number;
  onChange: (dimension: SheetDimension) => void;
  onRemove: () => void;
}) {
  const geometry = dimensionGeometry(d, offset);
  const { a, b, tx, ty, angle, textWidth, textHeight } = geometry;
  const drag = useRef<{ x: number; y: number; offset: number; along: number } | null>(null);
  const root = useRef<SVGGElement>(null);
  const { ux, uy, nx, ny } = dimensionAxes(d);
  // DXF has no white knockout fill. Break the dimension line itself around its text so
  // clearance survives there as well as in the SVG and PDF.
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const textAt = length / 2 + (d.along ?? 0);
  const gapStart = Math.max(0, Math.min(length, textAt - textWidth / 2));
  const gapEnd = Math.max(0, Math.min(length, textAt + textWidth / 2));
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const start = drag.current;
      const matrix = root.current?.ownerSVGElement?.getScreenCTM();
      if (!start || !matrix) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
      const dx = p.x - start.x,
        dy = p.y - start.y;
      const along = start.along + dx * ux + dy * uy;
      onChange({
        ...d,
        offset: start.offset + dx * nx + dy * ny,
        along: Math.abs(along) < 2 ? 0 : along,
      });
    };
    const end = () => {
      drag.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [d, nx, ny, ux, uy, onChange]);
  const head = (px: number, py: number, dx: number, dy: number) =>
    `M${px},${py}l${-dx * 2.6 - dy * 0.8},${-dy * 2.6 + dx * 0.8}l${dy * 1.6},${-dx * 1.6}z`;
  const ext = (source: [number, number], target: [number, number]) => {
    const dx = target[0] - source[0],
      dy = target[1] - source[1],
      l = Math.hypot(dx, dy);
    if (l < 1e-6) return null;
    return (
      <line
        x1={source[0] + dx / l}
        y1={source[1] + dy / l}
        x2={target[0] + (dx / l) * 1.5}
        y2={target[1] + (dy / l) * 1.5}
      />
    );
  };
  return (
    <g
      ref={root}
      className="dwg-dimension"
      data-drawing-control=""
      data-dimension={index}
      stroke={INK}
      strokeWidth="0.18"
      fill="none"
    >
      {ext(d.a, a)}
      {ext(d.b, b)}
      {gapStart > 0 && (
        <line x1={a[0]} y1={a[1]} x2={a[0] + ux * gapStart} y2={a[1] + uy * gapStart} />
      )}
      {gapEnd < length && (
        <line x1={a[0] + ux * gapEnd} y1={a[1] + uy * gapEnd} x2={b[0]} y2={b[1]} />
      )}
      <path d={head(a[0], a[1], -ux, -uy)} fill={INK} stroke="none" />
      <path d={head(b[0], b[1], ux, uy)} fill={INK} stroke="none" />
      <g transform={`rotate(${angle} ${tx} ${ty})`}>
        <rect
          data-dimension-mask=""
          fill="white"
          stroke="none"
          x={tx - textWidth / 2}
          y={ty - textHeight / 2}
          width={textWidth}
          height={textHeight}
        />
        {/* biome-ignore lint/a11y/useSemanticElements: SVG needs a focusable vector grip; an HTML button cannot carry this transform */}
        <g
          className="dwg-dimension__grip"
          role="button"
          aria-label={`Move dimension ${index + 1}`}
          tabIndex={0}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            const matrix = e.currentTarget.ownerSVGElement?.getScreenCTM();
            if (!matrix) return;
            const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
            drag.current = { x: p.x, y: p.y, offset, along: d.along ?? 0 };
            e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
              e.preventDefault();
              e.stopPropagation();
              const step = e.shiftKey ? 5 : 1;
              const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
              const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
              onChange({
                ...d,
                offset: offset + dx * nx + dy * ny,
                along: (d.along ?? 0) + dx * ux + dy * uy,
              });
            }
          }}
        >
          <rect
            x={tx - textWidth / 2 - 1}
            y={ty - 4}
            width={textWidth + 2}
            height="8"
            data-no-export=""
            fill="transparent"
            stroke="none"
          />
          <EditableDrawingText
            value={d.text}
            label={`Dimension ${index + 1} text`}
            x={tx}
            y={ty + 1.1}
            anchor="middle"
            onChange={(text) => onChange({ ...d, text })}
          />
        </g>
      </g>
    </g>
  );
}
