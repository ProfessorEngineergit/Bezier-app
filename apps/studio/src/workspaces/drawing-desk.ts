import { sheetSize } from './drawing-sheet.js';
import type { DrawingSheet } from './drawing-sheets.js';

export interface SheetPlate {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Two columns, with enough clearance for different paper formats and sheet labels. */
const GAP = 96;
export function drawingDesk(sheets: readonly DrawingSheet[]) {
  const sizes = sheets.map((sheet) => sheetSize(sheet.options.format));
  const columns = [0, 0];
  const rows: number[] = [];
  sizes.forEach(([w, h], i) => {
    columns[i % 2] = Math.max(columns[i % 2] ?? 0, w);
    const row = Math.floor(i / 2);
    rows[row] = Math.max(rows[row] ?? 0, h);
  });
  let y = 0;
  const starts = rows.map((height) => {
    const start = y;
    y += height + GAP;
    return start;
  });
  const plates: SheetPlate[] = sheets.map((sheet, i) => {
    const [width, height] = sizes[i] ?? sheetSize(sheet.options.format);
    return {
      id: sheet.id,
      x: i % 2 === 0 ? 0 : (columns[0] ?? 0) + GAP,
      y: starts[Math.floor(i / 2)] ?? 0,
      width,
      height,
    };
  });
  return {
    plates,
    width: (columns[0] ?? 0) + (sheets.length > 1 ? GAP + (columns[1] ?? 0) : 0),
    height: Math.max(0, y - GAP),
  };
}
