/**
 * All utility panel settings as one plain object, read and written by the panels and passed to the
 * viewport, so a new setting is a field rather than a prop through several layers. Pure, so unit
 * conversion and defaults are tested in Node.
 */

export type Unit = 'mm' | 'cm' | 'm' | 'in' | 'ft';
export type NumberFormat = 'decimal' | 'fractional';
export type GridPlane = 'XY' | 'YZ' | 'XZ';

export interface ViewSettings {
  /** Display unit. Documents always store millimetres (`document.ts`). */
  unit: Unit;
  format: NumberFormat;
  /** Snap increment in millimetres, or null when snapping is off. */
  gridLock: number | null;

  showGrid: boolean;
  gridPlane: GridPlane;
  showAxes: boolean;
  /** Field of view in degrees. */
  fieldOfView: number;
  /** Kept so older saved views load; no longer offered (parallel view only aligned to an axis). */
  parallel: boolean;
  animateCamera: boolean;

  display: 'shaded' | 'wireframe' | 'xray' | 'zebra' | 'curvature';
  showEdges: boolean;

  /** Height of the section plane along +Z, or null when not sectioning. */
  section: number | null;

  /** Screenshot options. */
  shotGrid: boolean;
  shotTransparent: boolean;
  shotEdges: boolean;
  shotScale: 1 | 2 | 4;
}

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  unit: 'mm',
  format: 'decimal',
  gridLock: null,
  showGrid: true,
  gridPlane: 'XY',
  showAxes: true,
  fieldOfView: 45,
  parallel: false,
  animateCamera: true,
  display: 'shaded',
  showEdges: true,
  section: null,
  shotGrid: false,
  shotTransparent: false,
  shotEdges: true,
  shotScale: 2,
};

/** Millimetres per unit. */
const PER_UNIT: Record<Unit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

export const UNIT_LABELS: Record<Unit, string> = {
  mm: 'Millimeter',
  cm: 'Centimeter',
  m: 'Meter',
  in: 'Inch',
  ft: 'Foot',
};

/** Converts millimetres to the display unit. */
export function toDisplay(millimetres: number, unit: Unit): number {
  return millimetres / PER_UNIT[unit];
}

/** Converts a displayed number back to millimetres. */
export function toMillimetres(value: number, unit: Unit): number {
  return value * PER_UNIT[unit];
}

/**
 * Formats a length in the chosen unit and format. Fractional is for imperial work (0.375 in as
 * 3/8), rounded to the nearest 1/64.
 */
export function formatLength(millimetres: number, settings: ViewSettings): string {
  const value = toDisplay(millimetres, settings.unit);
  if (!Number.isFinite(value)) return '';

  if (settings.format === 'decimal' || (settings.unit !== 'in' && settings.unit !== 'ft')) {
    return `${trim(value)} ${settings.unit}`;
  }

  const whole = Math.trunc(value);
  const sixtyFourths = Math.round(Math.abs(value - whole) * 64);
  if (sixtyFourths === 0) return `${whole} ${settings.unit}`;
  if (sixtyFourths === 64) return `${whole + Math.sign(value || 1)} ${settings.unit}`;

  const divisor = gcd(sixtyFourths, 64);
  const fraction = `${sixtyFourths / divisor}/${64 / divisor}`;
  return whole === 0
    ? `${value < 0 ? '-' : ''}${fraction} ${settings.unit}`
    : `${whole} ${fraction} ${settings.unit}`;
}

/** Rounds a length to the snap increment, if set. */
export function applyGridLock(millimetres: number, settings: ViewSettings): number {
  const step = settings.gridLock;
  if (step === null || step <= 0) return millimetres;
  return Math.round(millimetres / step) * step;
}

/** An area in the chosen unit squared, e.g. a body's surface (audit F-001). */
export function formatArea(squareMillimetres: number, settings: ViewSettings): string {
  const per = toDisplay(1, settings.unit);
  return `${trim(squareMillimetres * per * per)} ${settings.unit}²`;
}

/** A volume in the chosen unit cubed. */
export function formatVolume(cubicMillimetres: number, settings: ViewSettings): string {
  const per = toDisplay(1, settings.unit);
  return `${trim(cubicMillimetres * per * per * per)} ${settings.unit}³`;
}

function trim(value: number): string {
  return String(Number(value.toFixed(4)));
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
