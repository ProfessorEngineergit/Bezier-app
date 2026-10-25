import type {
  DetailState,
  SheetDimension,
  SheetOptions,
  ToleranceFrame,
  VectorLogo,
} from './drawing-sheet.js';
import { type PhysicsContent, parsePhysics } from './physics-sheets.js';

export interface DrawingSheet {
  id: string;
  name: string;
  options: SheetOptions;
  autoScale: boolean;
  logo: VectorLogo | null;
  dimensions: SheetDimension[];
  section: number | null;
  detail: DetailState;
  frames: ToleranceFrame[];
  /** null follows all visible bodies; an empty array deliberately draws none. */
  bodies: string[] | null;
  sketches: string[];
  /** A physics drawing: a solved study's result on the sheet instead of projected views. */
  physics?: PhysicsContent;
}
export interface DrawingBook {
  version: 1;
  active: string;
  sheets: DrawingSheet[];
}
export function newSheet(title: string, number = 1): DrawingSheet {
  return {
    id: crypto.randomUUID(),
    name: `Sheet ${number}`,
    options: {
      title,
      author: '',
      company: 'Bezier',
      number: `DWG-${String(number).padStart(3, '0')}`,
      revision: 'A',
      scale: 1,
      weight: 0.35,
      hidden: true,
      watermark: '',
      watermarkOpacity: 0.06,
      format: 'A3',
      projection: 'first',
    },
    autoScale: true,
    logo: null,
    dimensions: [],
    section: null,
    detail: { on: false, x: 0, y: 0, radius: 10 },
    frames: [],
    bodies: null,
    sketches: [],
  };
}
const record = (raw: unknown): raw is Record<string, unknown> =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw);
const finite = (raw: unknown): raw is number => typeof raw === 'number' && Number.isFinite(raw);
const strings = (raw: unknown): raw is string[] =>
  Array.isArray(raw) && raw.every((s: unknown) => typeof s === 'string');
const point = (raw: unknown): raw is [number, number] =>
  Array.isArray(raw) && raw.length === 2 && raw.every(finite);
function validSheet(raw: unknown): raw is DrawingSheet {
  if (!record(raw) || !record(raw.options) || !record(raw.detail)) return false;
  const o = raw.options,
    d = raw.detail;
  if (
    !['id', 'name'].every((k) => typeof raw[k] === 'string') ||
    !['title', 'author', 'company', 'number', 'revision', 'watermark'].every(
      (k) => typeof o[k] === 'string',
    )
  )
    return false;
  if (
    !finite(o.scale) ||
    o.scale <= 0 ||
    !finite(o.weight) ||
    o.weight <= 0 ||
    !finite(o.watermarkOpacity) ||
    o.watermarkOpacity < 0 ||
    o.watermarkOpacity > 1
  )
    return false;
  if (
    !['A4', 'A3', 'A2'].includes(String(o.format)) ||
    !['first', 'third'].includes(String(o.projection)) ||
    typeof o.hidden !== 'boolean' ||
    typeof raw.autoScale !== 'boolean'
  )
    return false;
  if ((raw.bodies !== null && !strings(raw.bodies)) || !strings(raw.sketches)) return false;
  if (raw.physics !== undefined && parsePhysics(raw.physics) === null) return false;
  if (raw.section !== null && (!finite(raw.section) || raw.section < 0 || raw.section > 1))
    return false;
  if (
    typeof d.on !== 'boolean' ||
    !finite(d.x) ||
    !finite(d.y) ||
    !finite(d.radius) ||
    d.radius <= 0
  )
    return false;
  if (
    !Array.isArray(raw.dimensions) ||
    !raw.dimensions.every(
      (a: unknown) =>
        record(a) &&
        point(a.a) &&
        point(a.b) &&
        typeof a.text === 'string' &&
        (a.view === undefined || typeof a.view === 'string') &&
        (a.kind === undefined || ['aligned', 'horizontal', 'vertical'].includes(String(a.kind))) &&
        ['offset', 'along', 'measured'].every((key) => a[key] === undefined || finite(a[key])),
    )
  )
    return false;
  if (
    !Array.isArray(raw.frames) ||
    !raw.frames.every(
      (f: unknown) =>
        record(f) &&
        typeof f.id === 'string' &&
        typeof f.tolerance === 'string' &&
        typeof f.datum === 'string' &&
        [
          'position',
          'flatness',
          'perpendicularity',
          'parallelism',
          'roundness',
          'profile',
        ].includes(String(f.characteristic)),
    )
  )
    return false;
  return (
    raw.logo === null ||
    (record(raw.logo) &&
      typeof raw.logo.viewBox === 'string' &&
      Array.isArray(raw.logo.paths) &&
      raw.logo.paths.every(
        (p: unknown) =>
          record(p) && ['d', 'fill', 'transform'].every((k) => typeof p[k] === 'string'),
      ))
  );
}
export function parseDrawingBook(text: string): DrawingBook {
  const raw: unknown = JSON.parse(text);
  if (
    !record(raw) ||
    raw.version !== 1 ||
    typeof raw.active !== 'string' ||
    !Array.isArray(raw.sheets) ||
    raw.sheets.length === 0 ||
    !raw.sheets.every(validSheet)
  )
    throw new Error('These drawing sheets could not be read. The model is unchanged.');
  const ids = new Set(raw.sheets.map((s: DrawingSheet) => s.id));
  if (ids.size !== raw.sheets.length || !ids.has(raw.active))
    throw new Error('These drawing sheets have invalid identifiers.');
  const book = raw as unknown as DrawingBook;
  // A physics drawing's content is read field by field, as anything stored is.
  return {
    ...book,
    sheets: book.sheets.map((sheet) => {
      const physics = sheet.physics === undefined ? null : parsePhysics(sheet.physics);
      return physics === null ? sheet : { ...sheet, physics };
    }),
  };
}

/** Whether a sheet is of the kind on show: drawing sheets, or physics drawings. */
export const isPhysics = (sheet: DrawingSheet): boolean => sheet.physics !== undefined;
