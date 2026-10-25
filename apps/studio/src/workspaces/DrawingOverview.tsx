import { type RefObject, useEffect, useState } from 'react';
import type { SheetPlate } from './drawing-desk.js';
import type { SheetView } from './drawing-sheet.js';

export function DrawingOverview({
  width,
  height,
  camera,
  desk,
  inspectorWidth,
  itemsOpen,
  itemsWidth,
  plates,
  active,
  previews,
  onPan,
  onFit,
}: {
  width: number;
  height: number;
  camera: { x: number; y: number; zoom: number };
  desk: RefObject<HTMLDivElement | null>;
  inspectorWidth: number;
  itemsOpen: boolean;
  itemsWidth: number;
  plates: readonly SheetPlate[];
  active: string;
  previews: Readonly<Record<string, readonly SheetView[]>>;
  onPan: (x: number, y: number) => void;
  onFit: () => void;
}) {
  const [size, setSize] = useState({ width: 1280, height: 800 });
  useEffect(() => {
    const el = desk.current;
    if (el === null) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, [desk]);
  const left = itemsOpen ? itemsWidth + 28 : 0;
  const visibleWidth = Math.max(1, size.width - left - inspectorWidth - 36);
  const x0 = Math.max(0, Math.min(width, (left - camera.x) / camera.zoom));
  const y0 = Math.max(0, Math.min(height, -camera.y / camera.zoom));
  const x1 = Math.max(x0, Math.min(width, (left + visibleWidth - camera.x) / camera.zoom));
  const y1 = Math.max(y0, Math.min(height, (size.height - camera.y) / camera.zoom));
  const seek = (svg: SVGSVGElement, x: number, y: number) => {
    const matrix = svg.getScreenCTM();
    if (matrix === null) return;
    const p = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    onPan(left + visibleWidth / 2 - p.x * camera.zoom, size.height / 2 - p.y * camera.zoom);
  };
  return (
    <aside className="dwg-overview" aria-label="Sheet overview">
      <header>
        <span>Overview</span>
        <button type="button" onClick={onFit}>
          Fit all
        </button>
      </header>
      <svg
        viewBox={`-16 -16 ${width + 32} ${height + 32}`}
        aria-label="Pan around drawing sheets"
        role="img"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(e.currentTarget, e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            seek(e.currentTarget, e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
      >
        {plates.map((plate, i) => (
          <g
            key={plate.id}
            data-sheet-preview={plate.id}
            data-active={plate.id === active ? '' : undefined}
            transform={`translate(${plate.x} ${plate.y})`}
          >
            <rect
              x="0"
              y="0"
              width={plate.width}
              height={plate.height}
              fill="#e7e7e9"
              rx="2"
              stroke={plate.id === active ? '#2f7bf5' : '#777b84'}
              strokeWidth={plate.id === active ? 2 : 1}
              vectorEffect="non-scaling-stroke"
            />
            <g fill="none" stroke="#73757a" strokeWidth="0.8">
              {(previews[plate.id] ?? []).map((v) => (
                <g key={v.name}>
                  {v.lines
                    .filter((l) => !l.hidden)
                    .map((l) => (
                      <polyline
                        key={`${v.name}-${l.points.join(',')}`}
                        points={l.points.join(' ')}
                      />
                    ))}
                </g>
              ))}
            </g>
            <text x="8" y="16" fill="#444951" fontSize="12">
              {i + 1}
            </text>
          </g>
        ))}
        <rect className="dwg-overview__window" x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
      </svg>
    </aside>
  );
}
