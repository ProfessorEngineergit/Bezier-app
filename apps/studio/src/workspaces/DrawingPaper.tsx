/**
 * The drawing sheet as vectors, from editing to export, laid out per ISO: frame with centring
 * marks, views labelled beneath, title block lower right with the projection symbol, aligned
 * dimensions, and feature control frames with drawn symbols (PDF fonts lack the GD&T glyphs).
 *
 * Only `line`, `path`, `rect`, `polyline` and `text`, which the PDF and DXF exporters read.
 * `data-no-export` marks screen-only aids (paper colour, snap markers).
 */

import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import { DrawingCallouts } from './DrawingCallouts.js';
import { DrawingDimension } from './DrawingDimension.js';
import { DrawingTitleBlock } from './DrawingTitleBlock.js';
import { hatchSection } from './drawing-detail.js';
import {
  type DimensionKind,
  type DrawingSnap,
  layoutDimensions,
  measuredDimension,
  snapDrawing,
  viewBounds,
} from './drawing-dimensions.js';
import {
  hiddenDash,
  type SheetDimension,
  type SheetOptions,
  type SheetView,
  symbolPath,
  type ToleranceFrame,
  type VectorLogo,
} from './drawing-sheet.js';

interface Props {
  options: SheetOptions;
  layout: SheetView[];
  svg: RefObject<SVGSVGElement | null>;
  width: number;
  height: number;
  dimensioning: boolean;
  logo: VectorLogo | null;
  first: DrawingSnap | null;
  dimensionKind: DimensionKind;
  sheetLabel: string;
  patch: <K extends keyof SheetOptions>(key: K, value: SheetOptions[K]) => void;
  dimensions: SheetDimension[];
  frames: ToleranceFrame[];
  setFirst: Dispatch<SetStateAction<DrawingSnap | null>>;
  setDimensions: Dispatch<SetStateAction<SheetDimension[]>>;
  /** Drawn on the sheet beside its views: a physics drawing's result (`PhysicsLayer`). */
  extra?: ReactNode;
  /** Where SECTION A–A and DETAIL B come from, marked on their source views (audit F-020). */
  callouts?: {
    section: number | null;
    detail: { on: boolean; x: number; y: number; radius: number };
  };
}

const INK = '#1f2830';
const MARGIN = 10;

const LABELS: Record<string, string> = {
  front: 'Front',
  top: 'Top',
  right: 'Right',
  isometric: 'Isometric',
  section: 'SECTION A–A',
  detail: 'DETAIL B (2 : 1)',
};

export function DrawingPaper({
  options,
  layout,
  svg,
  width,
  height,
  dimensioning,
  logo,
  first,
  dimensions,
  frames,
  setFirst,
  setDimensions,
  dimensionKind,
  sheetLabel,
  patch,
  extra,
  callouts,
}: Props) {
  const bounds = layout.map((view) => ({ view, box: viewBounds(view) }));
  const measurable = layout;
  const placed = layoutDimensions(dimensions, layout);

  return (
    <svg
      aria-label="Technical drawing sheet"
      className="drawing-paper"
      height={height}
      onClick={(event) => {
        if (
          !dimensioning ||
          !svg.current ||
          (event.target as Element).closest('[data-drawing-control]')
        )
          return;
        const matrix = svg.current.getScreenCTM();
        if (!matrix) return;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        const nearest = snapDrawing(
          layout,
          point.x,
          point.y,
          8 / Math.max(0.1, Math.hypot(matrix.a, matrix.b)),
          first?.view,
        );
        if (!nearest) return;
        if (!first) {
          setFirst(nearest);
          return;
        }
        const view = layout.find((v) => v.name === nearest.view);
        const dimension = view
          ? measuredDimension(
              first,
              nearest,
              view,
              view.name === 'isometric' ? 'aligned' : dimensionKind,
            )
          : null;
        if (dimension)
          setDimensions((old) => {
            const same = old.some(
              (d) =>
                d.view === dimension.view &&
                d.kind === dimension.kind &&
                ((d.a[0] === dimension.a[0] &&
                  d.a[1] === dimension.a[1] &&
                  d.b[0] === dimension.b[0] &&
                  d.b[1] === dimension.b[1]) ||
                  (d.b[0] === dimension.a[0] &&
                    d.b[1] === dimension.a[1] &&
                    d.a[0] === dimension.b[0] &&
                    d.a[1] === dimension.b[1])),
            );
            return same ? old : [...old, dimension];
          });
        setFirst(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setFirst(null);
      }}
      ref={svg}
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <title>{options.title} — technical drawing</title>
      <rect data-no-export="" fill="white" height={height} width={width} />

      {/* Frame, and the centring marks that let a print be aligned by eye. */}
      <rect
        fill="none"
        height={height - 2 * MARGIN}
        stroke={INK}
        strokeWidth="0.5"
        width={width - 2 * MARGIN}
        x={MARGIN}
        y={MARGIN}
      />
      <g stroke={INK} strokeWidth="0.5">
        <line x1={width / 2} x2={width / 2} y1={MARGIN - 5} y2={MARGIN + 5} />
        <line x1={width / 2} x2={width / 2} y1={height - MARGIN - 5} y2={height - MARGIN + 5} />
        <line x1={MARGIN - 5} x2={MARGIN + 5} y1={height / 2} y2={height / 2} />
        <line x1={width - MARGIN - 5} x2={width - MARGIN + 5} y1={height / 2} y2={height / 2} />
      </g>

      {options.watermark !== '' && (
        <text
          fill={INK}
          fontSize={Math.round(width / 14)}
          fontWeight="600"
          letterSpacing="4"
          opacity={options.watermarkOpacity}
          textAnchor="middle"
          x={width / 2}
          y={height / 2}
        >
          {options.watermark}
        </text>
      )}

      {extra}

      {bounds.map(({ view, box }) => (
        <g
          data-view={view.name}
          fill="none"
          key={view.name}
          stroke={INK}
          strokeLinejoin="round"
          strokeWidth={options.weight}
        >
          {view.name === 'section' &&
            hatchSection(view.lines.filter((l) => !l.hidden).map((l) => l.points)).map((points) => (
              <polyline
                key={`hatch-${points.join(',')}`}
                points={points.join(' ')}
                strokeWidth={options.weight * 0.4}
              />
            ))}
          {view.lines
            .filter((l) => options.hidden || !l.hidden)
            .map((line) => (
              <polyline
                key={`${view.name}-${line.hidden}-${line.points.join(',')}`}
                points={line.points.join(' ')}
                strokeDasharray={line.hidden ? hiddenDash(line.points) : undefined}
                strokeWidth={line.hidden ? options.weight * 0.55 : options.weight}
              />
            ))}
          {box !== null && (
            <text
              fill={INK}
              fontSize="3"
              fontWeight="600"
              letterSpacing="0.3"
              stroke="none"
              textAnchor="middle"
              x={(box.minX + box.maxX) / 2}
              y={box.maxY + 8}
            >
              {LABELS[view.name] ?? view.name.toUpperCase()}
            </text>
          )}
        </g>
      ))}

      {callouts !== undefined && (
        <DrawingCallouts
          detail={callouts.detail}
          layout={layout}
          section={callouts.section}
          weight={options.weight}
        />
      )}

      {placed.map(({ d, offset }, index) => (
        <DrawingDimension
          d={d}
          offset={offset}
          index={index}
          key={`${d.view}-${d.kind}-${d.a.join(',')}-${d.b.join(',')}`}
          onChange={(value) =>
            setDimensions((old) => old.map((item, i) => (i === index ? value : item)))
          }
          onRemove={() => setDimensions((old) => old.filter((_, i) => i !== index))}
        />
      ))}

      {/* Where a dimension can start or end, shown only while dimensioning. */}
      {dimensioning && (
        <g data-no-export="" fill="#2f7bf5" opacity="0.55">
          {measurable.flatMap((view) => {
            const seen = new Set<string>();
            return view.lines
              .filter((line) => !line.hidden)
              .flatMap((line) => {
                const nodes = [];
                for (const i of [0, line.points.length - 2]) {
                  const x = line.points[i] ?? 0,
                    y = line.points[i + 1] ?? 0;
                  const key = `${view.name}-${x.toFixed(5)}-${y.toFixed(5)}`;
                  if (seen.has(key) || (first !== null && first.view !== view.name)) continue;
                  if (
                    view.name === 'isometric' &&
                    !view.vertices.some((v) => Math.hypot(v.point[0] - x, v.point[1] - y) < 1e-4)
                  )
                    continue;
                  seen.add(key);
                  nodes.push(<circle cx={x} cy={y} key={key} r="0.7" />);
                }
                return nodes;
              });
          })}
        </g>
      )}
      {first && (
        <circle cx={first.point[0]} cy={first.point[1]} data-no-export="" fill="#2f7bf5" r="1.3" />
      )}

      {/* Feature control frames stack above the title block, as notes do. */}
      {frames.map((frame, index) => {
        const fx = MARGIN + 8;
        const fy = height - MARGIN - 12 - index * 9;
        const cells = frame.datum === '' ? [7, 22] : [7, 22, 9];
        let cursor = fx;
        return (
          <g fill="none" key={frame.id} stroke={INK} strokeWidth="0.25">
            {cells.map((w) => {
              const rect = <rect height="7" key={cursor} width={w} x={cursor} y={fy} />;
              cursor += w;
              return rect;
            })}
            <path d={symbolPath(frame.characteristic, fx + 3.5, fy + 3.5)} strokeWidth="0.3" />
            <text fill={INK} fontSize="3.2" stroke="none" x={fx + 9} y={fy + 4.8}>
              {frame.tolerance}
            </text>
            {frame.datum !== '' && (
              <text
                fill={INK}
                fontSize="3.2"
                stroke="none"
                textAnchor="middle"
                x={fx + 33.5}
                y={fy + 4.8}
              >
                {frame.datum}
              </text>
            )}
          </g>
        );
      })}

      <DrawingTitleBlock
        height={height}
        logo={logo}
        options={options}
        width={width}
        sheetLabel={sheetLabel}
        patch={patch}
      />
    </svg>
  );
}
