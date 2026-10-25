/**
 * Whether a `bench.html` run measured anything. A run whose camera never turned draws no frames,
 * so a row counts only when the camera turned and a frame was drawn for nearly every step.
 */

const MIN_SHARE = 0.9;

/** Why a run measured nothing worth reading, or null when it holds. */
export function invalidity(
  steps: number,
  turned: number,
  drawn: number,
  figures: { cpu: number; gap: number; pick: number },
): string | null {
  const needed = Math.ceil(steps * MIN_SHARE);
  if (turned < needed) return `the camera turned on ${turned} of ${steps} steps`;
  if (drawn < needed) return `${drawn} frames drawn for ${steps} steps`;
  if (![figures.cpu, figures.gap, figures.pick].every(Number.isFinite))
    return 'a figure is missing';
  return null;
}
