/**
 * What a display mode draws, decided in one place from all inputs that hide the body or show edges.
 * Pure, so it can be tested without a graphics context.
 */

import type { DisplayMode } from './viewport-api.js';

export interface Drawn {
  /** The shaded surface. */
  body: boolean;
  /** The extracted B-Rep edges. */
  edges: boolean;
}

/** Wireframe draws the model's B-Rep edges, not the tessellation (`material.wireframe`). */
export function visibilityFor(
  mode: DisplayMode,
  /** Simulation results stand in for the body, and would z-fight with it. */
  showingResults: boolean,
  /** Whether edges are switched on for their own sake. */
  edgesVisible: boolean,
): Drawn {
  return {
    body: !showingResults && mode !== 'wireframe',
    // In wireframe the edges are the drawing, so they are not optional.
    edges: edgesVisible || mode === 'wireframe',
  };
}
