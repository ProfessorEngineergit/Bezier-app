/**
 * Asks before a workspace opens a model too large to open quickly. Visualize renders every part and
 * Drawings projects every edge; on a 100k-face assembly either looks like a hang. Simulation is not
 * asked about: it meshes only on Solve, on its own thread.
 */

import type { Question } from './ask-question.js';

/** Face count from which a model counts as large (the Voron has 108,000). */
export const LARGE_FACES = 20_000;

/**
 * Drawings seconds per thousand faces on the Voron (33 s for 108,000 faces, WebKit, M1 Max,
 * `e2e/view/perf-voron.spec.ts` with DRAWINGS=1). Slower machines take longer.
 */
const DRAWINGS_SECONDS_PER_THOUSAND = 0.3;

const NAMES: Record<string, string> = {
  visualize: 'Visualize',
  drawings: 'Drawings',
};

/** The question to ask before opening `workspace` on a model of `faces` faces, or null. */
export function largeModelQuestion(workspace: string, faces: number): Question | null {
  const name = NAMES[workspace];
  // Browser tests use a box and lower the threshold.
  const large = (globalThis as { __bezierLargeFaces?: number }).__bezierLargeFaces ?? LARGE_FACES;
  if (name === undefined || faces < large) return null;
  const count = faces.toLocaleString('en-US');
  const wait =
    workspace === 'drawings'
      ? `Projecting its views takes about ${String(Math.max(10, Math.round(((faces / 1000) * DRAWINGS_SECONDS_PER_THOUSAND) / 5) * 5))} seconds on a fast computer, longer on a slower one, and the app stays usable meanwhile.`
      : `Opening it can take a while, and the app stays usable meanwhile.`;
  return {
    title: 'This model is very large',
    message: `It has ${count} faces. ${wait} Open ${name} anyway?`,
    yes: `Open ${name}`,
    no: 'Stay here',
    suggest: 'yes',
  };
}
