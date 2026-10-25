/**
 * Where a physics drawing's content goes on a drawing sheet, in paper millimetres: the pictures on
 * the left, a column on the right with the scale, the readings, the setup and notes, all above the
 * sheet's own title block and inside its frame (`DrawingPaper`, `DrawingTitleBlock`).
 */

import { SHEET_MARGIN, TITLE_H } from './DrawingTitleBlock.js';
import type { SheetView } from './drawing-sheet.js';
import type { PhysicsContent } from './physics-sheets.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhysicsLayout {
  /** One rectangle per shown picture, with the index of the picture in `content.views`. */
  views: (Rect & { index: number })[];
  column: Rect;
}

const GAP = 6;
/** Room under each picture for its name. */
const CAPTION = 7;

export function physicsLayout(
  content: PhysicsContent,
  width: number,
  height: number,
): PhysicsLayout {
  const top = SHEET_MARGIN + GAP;
  // Everything stands above the title block, which runs along the foot on the right.
  const bottom = height - SHEET_MARGIN - TITLE_H - GAP;
  const columnWidth = Math.round(Math.min(120, width * 0.3));
  const column = {
    x: width - SHEET_MARGIN - GAP - columnWidth,
    y: top,
    width: columnWidth,
    height: bottom - top,
  };
  const area = {
    x: SHEET_MARGIN + GAP,
    y: top,
    width: column.x - GAP * 2 - SHEET_MARGIN,
    height: bottom - top,
  };
  const shown = content.views.flatMap((view, index) => (view.shown ? [index] : []));
  return { views: placeViews(content, shown, area), column };
}

function placeViews(
  sheet: PhysicsContent,
  shown: readonly number[],
  area: Rect,
): (Rect & { index: number })[] {
  // The picture as large as its cell allows at its own proportions, centred, with the room for its
  // name directly under it rather than at the foot of the cell.
  const cell = (index: number, x: number, y: number, w: number, h: number) => {
    const aspect = sheet.views[index]?.aspect ?? 16 / 10;
    const room = h - CAPTION;
    const width = Math.min(w, room * aspect);
    const height = width / aspect;
    return {
      index,
      x: x + (w - width) / 2,
      y: y + (room - height) / 2,
      width,
      height,
    };
  };
  if (shown.length === 0) return [];
  if (shown.length === 1)
    return [cell(shown[0] as number, area.x, area.y, area.width, area.height)];
  if (sheet.layout === 'feature' && shown.includes(sheet.main)) {
    // The large one across the top two thirds, the others side by side under it.
    const rest = shown.filter((index) => index !== sheet.main);
    const bigH = (area.height - GAP) * (2 / 3);
    const smallH = area.height - GAP - bigH;
    const smallW = (area.width - GAP * (rest.length - 1)) / rest.length;
    return [
      cell(sheet.main, area.x, area.y, area.width, bigH),
      ...rest.map((index, i) =>
        cell(index, area.x + i * (smallW + GAP), area.y + bigH + GAP, smallW, smallH),
      ),
    ];
  }
  // A grid as square as the count allows: two by two for three or four, side by side for two.
  const columns = shown.length <= 2 ? shown.length : 2;
  const rows = Math.ceil(shown.length / columns);
  const w = (area.width - GAP * (columns - 1)) / columns;
  const h = (area.height - GAP * (rows - 1)) / rows;
  return shown.map((index, i) =>
    cell(
      index,
      area.x + (i % columns) * (w + GAP),
      area.y + Math.floor(i / columns) * (h + GAP),
      w,
      h,
    ),
  );
}

/** Text broken into lines of at most `width` characters, at spaces. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line === '') line = word;
      else if (line.length + 1 + word.length <= width) line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * A physics drawing as the overview draws a sheet: each picture's rectangle and the column's, as
 * lines, in place of the projected views a drawing sheet has.
 */
export function physicsPreview(
  content: PhysicsContent,
  width: number,
  height: number,
): SheetView[] {
  const { views, column } = physicsLayout(content, width, height);
  const box = (name: string, r: Rect): SheetView => ({
    name,
    lines: [
      {
        points: [
          r.x,
          r.y,
          r.x + r.width,
          r.y,
          r.x + r.width,
          r.y + r.height,
          r.x,
          r.y + r.height,
          r.x,
          r.y,
        ],
        hidden: false,
      },
    ],
    x: r.x,
    y: r.y,
    scale: 1,
    vertices: [],
  });
  return [
    ...views.map((view) => box(content.views[view.index]?.label ?? 'view', view)),
    box('column', column),
  ];
}
