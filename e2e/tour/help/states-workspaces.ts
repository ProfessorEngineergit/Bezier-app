import type { State } from './frame.js';
import { DRAWINGS } from './states-workspaces-drawings.js';
import { LEARN } from './states-workspaces-learn.js';
import { SIMULATION } from './states-workspaces-sim.js';
import { VIEW_TOOLS } from './states-workspaces-view-tools.js';
import { VISUALIZE } from './states-workspaces-visualize.js';

export const WORKSPACES: Record<string, State> = {
  ...SIMULATION,
  ...DRAWINGS,
  ...VISUALIZE,
  ...VIEW_TOOLS,
  ...LEARN,
};
