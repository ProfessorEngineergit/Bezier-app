/** Every article of the app, in the order the wiki lists them within an area. */

import type { BuiltIn } from '../define.js';
import { BASICS } from './basics.js';
import { COLLAB } from './collab.js';
import { FILES } from './files.js';
import { MODELING } from './modeling.js';
import { SETTINGS } from './settings.js';
import { SKETCH } from './sketch.js';
import { START } from './start.js';
import { VIEW } from './view.js';
import { WORKSPACES } from './workspaces.js';

export const ARTICLES: readonly BuiltIn[] = [
  ...BASICS,
  ...SKETCH,
  ...MODELING,
  ...VIEW,
  ...FILES,
  ...WORKSPACES,
  ...SETTINGS,
  ...START,
  ...COLLAB,
];
