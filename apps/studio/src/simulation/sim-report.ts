/**
 * Exports for a solved study: a values table, pictures from several sides, and a physics drawing
 * (one sheet with those pictures, the colour scale, readings and setup). Everything is made from
 * what is on screen and saved through the single save path (`download.ts`).
 */

import { materialOf, type Study } from '@bezier/sim';
import { save } from '../download.js';
import type { ViewportHandle } from '../Viewport.js';
import type { PhysicsContent } from '../workspaces/physics-sheets.js';
import { format, summaryOf, titleOf } from './SimulationParts.js';
import type { SimulationResult } from './sim-protocol.js';
import type { Placement } from './use-simulation.js';

export interface Legend {
  min: number;
  max: number;
  unit: string;
  label: string;
  palette: string;
}

/** The result as a table, one row per model point, under a header of what was solved for. */
export function valuesCsv(
  study: Study,
  result: SimulationResult,
  positions: Float32Array,
  name: string,
): string {
  const f = result.fields;
  const columns: [string, Float32Array][] =
    result.studyKind === 'thermal'
      ? [
          ['temperature_C', f.temperature ?? new Float32Array(0)],
          ['heat_flux_W_m2', f.flux ?? new Float32Array(0)],
        ]
      : result.studyKind === 'shape-optimisation'
        ? [['density', f.density ?? new Float32Array(0)]]
        : [
            ['von_mises_MPa', f.vonMises],
            ['displacement_mm', f.displacement],
            ['safety_factor', f.safety],
          ];
  const s = result.summary;
  const material = materialOf(study);
  const head = [
    `# ${name}, ${study.name}`,
    `# material: ${material.name}`,
    `# elements: ${result.elements}, voxel edge ${format(result.h)} mm, ${result.iterations} iterations`,
    result.studyKind === 'thermal'
      ? `# temperature ${format(s.minTemperature ?? 0)} to ${format(s.maxTemperature ?? 0)} C, max heat flux ${format(s.maxFlux ?? 0)} W/m2`
      : `# max von Mises ${format(s.maxVonMises)} MPa, max displacement ${format(s.maxDisplacement)} mm, min safety factor ${format(s.minSafetyFactor)}`,
    ['x_mm', 'y_mm', 'z_mm', ...columns.map(([label]) => label)].join(','),
  ];
  const rows: string[] = [];
  const count = positions.length / 3;
  for (let v = 0; v < count; v++) {
    const cells = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]].map((n) =>
      (n ?? 0).toFixed(3),
    );
    for (const [, values] of columns)
      cells.push(Number((values[v] ?? 0).toPrecision(6)).toString());
    rows.push(cells.join(','));
  }
  return `${head.join('\n')}\n${rows.join('\n')}\n`;
}

export async function saveValues(
  study: Study,
  result: SimulationResult,
  positions: Float32Array,
  name: string,
): Promise<string | null> {
  return save(valuesCsv(study, result, positions, name), `${name} - ${study.name}.csv`, 'text/csv');
}

/** The sides a study is pictured from, by view cube name. */
export const VIEW_ANGLES = [
  { label: 'Front', sides: ['front'] },
  { label: 'Top', sides: ['top'] },
  { label: 'Right', sides: ['right'] },
  { label: 'Iso', sides: ['front', 'right', 'top'] },
] as const;

const twoFrames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

/**
 * Pictures of the result from the four sides. The camera moves without animation and is put back
 * at the starting view afterwards, since the viewport cannot report where it was.
 */
export async function captureViews(
  handle: ViewportHandle,
  around: { grid: boolean; axes: boolean },
): Promise<{ label: string; image: Blob }[]> {
  const pictures: { label: string; image: Blob }[] = [];
  // Without background, grid and axes: on a white sheet the picture is the part and its result
  // in either theme (a grid without its background renders as a black mesh).
  handle.setGridVisible(false);
  handle.setAxesVisible(false);
  try {
    for (const view of VIEW_ANGLES) {
      if (view.sides.length === 1) handle.setView(view.sides[0], false);
      else handle.setViewBetween(view.sides, false);
      handle.zoomToFit();
      await twoFrames();
      const image = await handle.capture({ scale: 1, transparent: true });
      if (image !== null) pictures.push({ label: view.label, image });
    }
  } finally {
    handle.setGridVisible(around.grid);
    handle.setAxesVisible(around.axes);
    handle.setViewBetween(['front', 'right', 'top'], false);
    handle.zoomToFit();
  }
  return pictures;
}

export async function savePictures(
  handle: ViewportHandle,
  around: { grid: boolean; axes: boolean },
  name: string,
  study: Study,
) {
  for (const picture of await captureViews(handle, around))
    await save(picture.image, `${name} - ${study.name} - ${picture.label}.png`, 'image/png');
}

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('The picture could not be read.'));
    reader.readAsDataURL(blob);
  });

/**
 * A physics drawing of the result as shown: four side views, the scale, readings and setup, as a
 * sheet for Drawings to arrange and annotate (`workspaces/physics-sheets.ts`).
 */
export async function makePhysicsSheet(input: {
  handle: ViewportHandle;
  study: Study;
  result: SimulationResult;
  legend: Legend;
  placements: readonly Placement[];
  around: { grid: boolean; axes: boolean };
}): Promise<PhysicsContent> {
  const { handle, study, result, legend, placements, around } = input;
  const pictures = await captureViews(handle, around);
  const views = await Promise.all(
    pictures.map(async (picture) => {
      const bitmap = await createImageBitmap(picture.image);
      const aspect = bitmap.width / Math.max(1, bitmap.height);
      bitmap.close();
      return { label: picture.label, image: await dataUrl(picture.image), shown: true, aspect };
    }),
  );
  const s = result.summary;
  const material = materialOf(study);
  const readings: [string, string][] =
    result.studyKind === 'thermal'
      ? [
          ['Highest temperature', `${format(s.maxTemperature ?? 0)} °C`],
          ['Lowest temperature', `${format(s.minTemperature ?? 0)} °C`],
          ['Largest heat flux', `${format(s.maxFlux ?? 0)} W/m²`],
          ['Heat in', `${format(s.heatIn ?? 0)} W`],
        ]
      : result.studyKind === 'shape-optimisation'
        ? [['Material kept', `${Math.round((s.volumeFraction ?? 0) * 100)} %`]]
        : [
            ['Max von Mises stress', `${format(s.maxVonMises)} MPa`],
            ['Max displacement', `${format(s.maxDisplacement)} mm`],
            ['Min safety factor', s.minSafetyFactor >= 15 ? '15+' : format(s.minSafetyFactor)],
          ];
  const setup: [string, string][] = [
    ['Material', material.name],
    ...placements.map((placement): [string, string] => [titleOf(placement), summaryOf(placement)]),
    ['Mesh', `${result.elements.toLocaleString('en-US')} voxels, ${format(result.h)} mm`],
  ];
  return {
    study: study.name,
    created: new Date().toISOString().slice(0, 10),
    notes: '',
    layout: 'grid',
    main: views.length - 1,
    legend: { ...legend },
    readings,
    setup,
    views,
    show: { legend: true, readings: true, setup: true, notes: true },
  };
}
