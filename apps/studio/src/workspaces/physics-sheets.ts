/**
 * Physics drawings: drawing sheets that carry a solved study instead of projected views, in the
 * same book and desk and exported like any sheet. Their pictures are snapshots from when the
 * drawing was made and are never regenerated, so later part changes cannot alter a recorded result.
 */

export interface PhysicsView {
  label: string;
  /** A `data:image/png` URL, stored in the sheet so it travels with the project. */
  image: string;
  shown: boolean;
  /** Picture width over height, so its label can sit right under it on the sheet. */
  aspect: number;
}

export interface PhysicsLegend {
  label: string;
  unit: string;
  min: number;
  max: number;
  /** One of the palettes in `PHYSICS_PALETTES`. */
  palette: string;
}

/**
 * What makes a drawing sheet a physics drawing (`DrawingSheet.physics`). Size, title block,
 * number, logo and export are the drawing sheet's own.
 */
export interface PhysicsContent {
  /** The study's name when the drawing was made. */
  study: string;
  /** ISO date the drawing was made. */
  created: string;
  notes: string;
  /** Pictures in a grid, or one large with the others below. */
  layout: 'grid' | 'feature';
  /** Which picture is the large one in the `feature` layout. */
  main: number;
  legend: PhysicsLegend;
  readings: [string, string][];
  setup: [string, string][];
  views: PhysicsView[];
  show: { legend: boolean; readings: boolean; setup: boolean; notes: boolean };
}

/** The colour scales as the model draws them, low to high. */
export const PHYSICS_PALETTES: Record<string, readonly (readonly [number, string])[]> = {
  rainbow: [
    [0, '#1a38d9'],
    [0.25, '#00b8f2'],
    [0.5, '#2ed152'],
    [0.75, '#fad61a'],
    [1, '#eb291f'],
  ],
  safety: [
    [0, '#e6241f'],
    [0.33, '#fab81a'],
    [0.66, '#29bd61'],
    [1, '#1f75db'],
  ],
  density: [
    [0, '#4d525c'],
    [1, '#dbe0e5'],
  ],
};

type Raw = Record<string, unknown>;
const record = (value: unknown): Raw =>
  typeof value === 'object' && value !== null ? (value as Raw) : {};
const text = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const number = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const flag = (value: unknown, fallback = true) => (typeof value === 'boolean' ? value : fallback);
const pairs = (value: unknown): [string, string][] =>
  Array.isArray(value)
    ? value.flatMap((pair) =>
        Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string'
          ? [[pair[0], pair[1]] as [string, string]]
          : [],
      )
    : [];

/** Reads stored physics content field by field; null when it is not physics content. */
export function parsePhysics(value: unknown): PhysicsContent | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = record(value);
  const views = Array.isArray(raw.views)
    ? raw.views.flatMap((view) => {
        const v = record(view);
        const image = text(v.image);
        return image.startsWith('data:image/')
          ? [
              {
                label: text(v.label, 'View'),
                image,
                shown: flag(v.shown),
                aspect: Math.max(0.2, Math.min(5, number(v.aspect, 16 / 10))),
              },
            ]
          : [];
      })
    : [];
  const legend = record(raw.legend);
  const show = record(raw.show);
  return {
    study: text(raw.study),
    created: text(raw.created),
    notes: text(raw.notes),
    layout: raw.layout === 'feature' ? 'feature' : 'grid',
    main: Math.max(0, Math.min(views.length - 1, Math.round(number(raw.main)))),
    legend: {
      label: text(legend.label),
      unit: text(legend.unit),
      min: number(legend.min),
      max: number(legend.max),
      palette:
        typeof legend.palette === 'string' && legend.palette in PHYSICS_PALETTES
          ? legend.palette
          : 'rainbow',
    },
    readings: pairs(raw.readings),
    setup: pairs(raw.setup),
    views,
    show: {
      legend: flag(show.legend),
      readings: flag(show.readings),
      setup: flag(show.setup),
      notes: flag(show.notes),
    },
  };
}
