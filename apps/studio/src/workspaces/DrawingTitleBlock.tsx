/** The ISO title block, editable directly on paper and identical in vector exports. */
import type { SheetOptions, VectorLogo } from './drawing-sheet.js';
import { circlePath as circle } from './drawing-sheet.js';
import { EditableDrawingText } from './EditableDrawingText.js';

const INK = '#1f2830',
  MUTED = '#6b7680',
  MARGIN = 10;
/** The title block's size and the frame's margin, for what is laid out around them. */
export const TITLE_W = 180,
  TITLE_H = 36,
  SHEET_MARGIN = MARGIN;
/**
 * First- or third-angle projection symbol (ISO 5456-2): a truncated cone from the side and end-on
 * as two circles, arranged per the projection method.
 */
function projectionSymbol(kind: SheetOptions['projection'], x: number, y: number) {
  const side = `M${x},${y - 2.5}L${x + 6},${y - 4}V${y + 4}L${x},${y + 2.5}Z`;
  // The end view goes where that projection puts a view from the left.
  const endX = kind === 'third' ? x - 5 : x + 11;
  return (
    <g fill="none" stroke={INK} strokeWidth="0.25">
      <path d={side} />
      <path d={circle(endX, y, 4)} />
      <path d={circle(endX, y, 2.5)} />
      <path d={`M${x - 8},${y}h22`} strokeDasharray="1.6 0.6 0.3 0.6" strokeWidth="0.18" />
    </g>
  );
}

export function DrawingTitleBlock({
  options,
  width,
  height,
  logo,
  sheetLabel,
  patch,
}: {
  options: SheetOptions;
  width: number;
  height: number;
  logo: VectorLogo | null;
  sheetLabel: string;
  patch: <K extends keyof SheetOptions>(key: K, value: SheetOptions[K]) => void;
}) {
  const x = width - MARGIN - TITLE_W;
  const y = height - MARGIN - TITLE_H;
  const row = TITLE_H / 3;
  const scale =
    options.scale >= 1 ? `${options.scale} : 1` : `1 : ${Math.round(1 / options.scale)}`;
  const cell = (cx: number, cy: number, label: string, value: string, size = 3.2) => (
    <g>
      <text fill={MUTED} fontSize="1.8" x={cx + 1.5} y={cy + 2.8}>
        {label}
      </text>
      {label === 'SHEET' || label === 'SCALE' || label === 'DATE' || label === 'FORMAT · UNITS' ? (
        <text fill={INK} fontSize={size} x={cx + 1.5} y={cy + row - 2.2}>
          {value}
        </text>
      ) : (
        <EditableDrawingText
          value={value}
          label={label}
          x={cx + 1.5}
          y={cy + row - 2.2}
          size={size}
          onChange={(text) => {
            const key = {
              TITLE: 'title',
              COMPANY: 'company',
              'DRAWING NO.': 'number',
              REV: 'revision',
              'DRAWN BY': 'author',
            }[label];
            if (
              key === 'title' ||
              key === 'company' ||
              key === 'number' ||
              key === 'revision' ||
              key === 'author'
            )
              patch(key, text);
          }}
        />
      )}
    </g>
  );
  return (
    <g>
      <rect
        fill="white"
        height={TITLE_H}
        stroke={INK}
        strokeWidth="0.35"
        width={TITLE_W}
        x={x}
        y={y}
      />
      <g stroke={INK} strokeWidth="0.18">
        <line x1={x} x2={x + TITLE_W} y1={y + row} y2={y + row} />
        <line x1={x} x2={x + TITLE_W} y1={y + 2 * row} y2={y + 2 * row} />
        {/* Row 2: drawing number | rev | scale | sheet */}
        <line x1={x + 70} x2={x + 70} y1={y + row} y2={y + 2 * row} />
        <line x1={x + 92} x2={x + 92} y1={y + row} y2={y + 2 * row} />
        <line x1={x + 130} x2={x + 130} y1={y + row} y2={y + 3 * row} />
        {/* Row 3: drawn by | date | format | projection */}
        <line x1={x + 50} x2={x + 50} y1={y + 2 * row} y2={y + TITLE_H} />
        <line x1={x + 92} x2={x + 92} y1={y + 2 * row} y2={y + TITLE_H} />
        <line x1={x + 150} x2={x + 150} y1={y} y2={y + row} />
      </g>
      {cell(x, y, 'TITLE', options.title || 'Untitled', 4.4)}
      {logo ? (
        <svg
          aria-hidden="true"
          height={row - 2}
          viewBox={logo.viewBox}
          width={28}
          x={x + 151}
          y={y + 1}
        >
          {logo.paths.map((p) => (
            <path key={p.d} {...p} />
          ))}
        </svg>
      ) : (
        cell(x + 150, y, 'COMPANY', options.company, 2.8)
      )}
      {cell(x, y + row, 'DRAWING NO.', options.number)}
      {cell(x + 70, y + row, 'REV', options.revision)}
      {cell(x + 92, y + row, 'SCALE', scale)}
      {cell(x + 130, y + row, 'SHEET', sheetLabel)}
      {cell(x, y + 2 * row, 'DRAWN BY', options.author || '—')}
      {cell(x + 50, y + 2 * row, 'DATE', new Date().toISOString().slice(0, 10), 2.8)}
      {cell(x + 92, y + 2 * row, 'FORMAT · UNITS', `${options.format} · mm`, 2.8)}
      <text fill={MUTED} fontSize="1.8" x={x + 131.5} y={y + 2 * row + 2.8}>
        {options.projection === 'first' ? 'FIRST ANGLE' : 'THIRD ANGLE'}
      </text>
      {projectionSymbol(options.projection, x + 140, y + 2 * row + 7.6)}
    </g>
  );
}
