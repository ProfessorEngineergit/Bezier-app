/**
 * Physics drawing content on a drawing sheet (`DrawingPaper`'s `extra`): result pictures, colour
 * scale, readings, setup and notes. Frame, title block, size and export belong to the sheet.
 */

import { useId } from 'react';
import { physicsLayout, wrap } from './physics-layout.js';
import { PHYSICS_PALETTES, type PhysicsContent } from './physics-sheets.js';

// The drawing sheet's ink and secondary grey (DrawingPaper, DrawingTitleBlock).
const INK = '#1f2830';
const MUTED = '#6b7680';
const RULE = '#c7cdd2';
const ROW = 5.6;

/** A reading on the sheet: about three significant figures, as the study panel writes it. */
function figure(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const size = Math.abs(value);
  if (size === 0) return '0';
  const t =
    size >= 1000
      ? value.toFixed(0)
      : size >= 100
        ? value.toFixed(1)
        : size >= 1
          ? value.toFixed(2)
          : value.toPrecision(3);
  return t.includes('.') && !t.includes('e') ? t.replace(/\.?0+$/, '') : t;
}

export function PhysicsLayer({
  content,
  width,
  height,
}: {
  content: PhysicsContent;
  width: number;
  height: number;
}) {
  const { views, column } = physicsLayout(content, width, height);
  const gradient = `physics-${useId().replace(/:/g, '')}`;
  let y = column.y + 6;
  const blocks: React.ReactNode[] = [];

  if (content.show.legend) {
    const barH = Math.min(78, column.height * 0.38);
    blocks.push(
      <g key="legend">
        <text fill={INK} fontSize={5} fontWeight={600} x={column.x} y={y}>
          {content.legend.label}
          {content.legend.unit !== '' && (
            <tspan dx={2.5} fill={MUTED} fontSize={3.4} fontWeight={400}>
              {content.legend.unit}
            </tspan>
          )}
        </text>
        <rect
          fill={`url(#${gradient})`}
          height={barH}
          stroke={RULE}
          strokeWidth={0.25}
          width={7}
          x={column.x}
          y={y + 4}
        />
        {Array.from({ length: 6 }, (_, i) => {
          const value = content.legend.max - ((content.legend.max - content.legend.min) * i) / 5;
          const ty = y + 4 + (barH * i) / 5;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: the ticks are positional
            <g key={i}>
              <line
                stroke={INK}
                strokeWidth={0.25}
                x1={column.x + 7}
                x2={column.x + 9}
                y1={ty}
                y2={ty}
              />
              <text fill={INK} fontSize={3.2} x={column.x + 11} y={ty + 1.1}>
                {figure(value)}
              </text>
            </g>
          );
        })}
      </g>,
    );
    y += barH + 16;
  }

  const table = (key: string, title: string, rows: readonly [string, string][]) => {
    const top = y;
    y += rows.length * ROW + 10;
    return (
      <g key={key}>
        <text fill={MUTED} fontSize={3} fontWeight={600} letterSpacing={0.3} x={column.x} y={top}>
          {title.toUpperCase()}
        </text>
        <line
          stroke={RULE}
          strokeWidth={0.25}
          x1={column.x}
          x2={column.x + column.width}
          y1={top + 1.6}
          y2={top + 1.6}
        />
        {rows.map(([label, value], i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a row is its place in the table
          <g key={i}>
            <text fill={MUTED} fontSize={3.2} x={column.x} y={top + 7 + i * ROW}>
              {label}
            </text>
            <text
              fill={INK}
              fontSize={3.2}
              fontWeight={600}
              textAnchor="end"
              x={column.x + column.width}
              y={top + 7 + i * ROW}
            >
              {value}
            </text>
          </g>
        ))}
      </g>
    );
  };
  if (content.show.readings && content.readings.length > 0)
    blocks.push(table('readings', 'Result', content.readings));
  if (content.show.setup && content.setup.length > 0)
    blocks.push(table('setup', 'Setup', content.setup));
  if (content.show.notes && content.notes.trim() !== '') {
    const lines = wrap(content.notes, Math.floor(column.width / 1.75));
    const room = Math.max(0, Math.floor((column.y + column.height - y - 7) / 4.6));
    const top = y;
    blocks.push(
      <g key="notes">
        <text fill={MUTED} fontSize={3} fontWeight={600} letterSpacing={0.3} x={column.x} y={top}>
          NOTES
        </text>
        <line
          stroke={RULE}
          strokeWidth={0.25}
          x1={column.x}
          x2={column.x + column.width}
          y1={top + 1.6}
          y2={top + 1.6}
        />
        {lines.slice(0, room).map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a line is its place in the paragraph
          <text fill={INK} fontSize={3.2} key={i} x={column.x} y={top + 7 + i * 4.6}>
            {line}
          </text>
        ))}
      </g>,
    );
  }

  return (
    <g data-physics="">
      <defs>
        <linearGradient id={gradient} x1="0" x2="0" y1="1" y2="0">
          {(PHYSICS_PALETTES[content.legend.palette] ?? PHYSICS_PALETTES.rainbow ?? []).map(
            ([at, colour]) => (
              <stop key={at} offset={at} stopColor={colour} />
            ),
          )}
        </linearGradient>
      </defs>
      {views.map((cell) => {
        const view = content.views[cell.index];
        if (view === undefined) return null;
        return (
          <g key={cell.index}>
            <image
              height={cell.height}
              href={view.image}
              preserveAspectRatio="xMidYMid meet"
              width={cell.width}
              x={cell.x}
              y={cell.y}
            />
            {/* Labelled underneath, like every view on a drawing sheet. */}
            <text
              fill={INK}
              fontSize="3"
              fontWeight="600"
              letterSpacing="0.3"
              textAnchor="middle"
              x={cell.x + cell.width / 2}
              y={cell.y + cell.height + 5}
            >
              {view.label.toUpperCase()}
            </text>
          </g>
        );
      })}
      {blocks}
    </g>
  );
}
