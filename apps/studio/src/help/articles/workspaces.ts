import type { define } from '../define.js';
import { DRAWINGS } from './workspaces-drawings.js';
import { LEARN } from './workspaces-learn.js';
import { SIMULATION } from './workspaces-simulation.js';
import { VIEW_TOOLS } from './workspaces-view-tools.js';
import { VISUALIZE } from './workspaces-visualize.js';

export const WORKSPACES: readonly ReturnType<typeof define>[] = [
  ...SIMULATION,
  ...DRAWINGS,
  ...VISUALIZE,
  ...VIEW_TOOLS,
  ...LEARN,
];
