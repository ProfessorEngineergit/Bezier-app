/**
 * Keyboard presets matching other tools' documented default keys. Each preset starts from Native
 * and overrides what the tool binds differently. Where the Native key does something else in that
 * tool, the action gets no key (`''`). A tool's Ctrl is Cmd here, as in its Mac version.
 * Only single chords can be bound (`shortcut.ts`); presets note how they replace key sequences.
 */

import type { Shortcut } from './shortcut.js';

export type KeymapPresetId =
  | 'native'
  | 'blender'
  | 'fusion360'
  | 'freecad'
  | 'solidworks'
  | 'onshape'
  | 'inventor'
  | 'nx'
  | 'sketchup'
  | 'autocad';

/** Key per action. Missing: no key in that preset. */
type Bindings = Readonly<Record<string, Shortcut>>;

export const NATIVE: Bindings = {
  line: 'L',
  arc: 'A',
  rectangle: 'R',
  circle: 'C',
  trim: 'T',
  'constrain-parallel': 'Shift+A',
  'constrain-concentric': 'Shift+C',
  'constrain-equal': 'Shift+E',
  'constrain-aligned': 'Shift+V',
  'constrain-coincident': 'Shift+N',
  'constrain-fix': 'Shift+L',
  'constrain-perpendicular': 'Shift+P',
  'constrain-tangent': 'Shift+T',
  extrude: 'E',
  fillet: 'F',
  shell: 'H',
  'move-rotate': 'M',
  scale: 'S',
  revolve: 'V',
  split: 'K',
  union: 'Cmd+U',
  subtract: 'Cmd+B',
  intersect: 'Cmd+I',
  'view-reset': 'Cmd+1',
  'view-front': 'Cmd+2',
  'view-back': 'Cmd+3',
  'view-top': 'Cmd+4',
  'view-bottom': 'Cmd+5',
  'view-right': 'Cmd+6',
  'view-left': 'Cmd+7',
  'view-square': 'Space',
  'zoom-fit': 'Shift+F',
  undo: 'Cmd+Z',
  redo: 'Shift+Cmd+Z',
  delete: 'Backspace',
  duplicate: 'Cmd+D',
  'select-all': 'Cmd+A',
  deselect: 'Cmd+.',
  'filter-cycle': 'Tab',
  items: 'Alt+Cmd+S',
  variables: 'Shift+Cmd+V',
  import: 'Shift+Cmd+I',
  settings: 'Cmd+,',
  home: 'Cmd+H',
};

/**
 * Blender: G grab, S scale, Ctrl+B bevel, X delete, Shift+D duplicate, number row for side views.
 * Sketch tools keep their letters except where Blender's own commands use them.
 */
const BLENDER: Bindings = {
  ...NATIVE,
  'move-rotate': 'G',
  scale: 'S',
  fillet: 'Ctrl+B',
  delete: 'X',
  duplicate: 'Shift+D',
  'select-all': 'A',
  deselect: 'Alt+A',
  arc: 'Shift+Alt+A',
  'view-front': '1',
  'view-back': 'Ctrl+1',
  'view-right': '3',
  'view-left': 'Ctrl+3',
  'view-top': '7',
  'view-bottom': 'Ctrl+7',
  'view-reset': 'Home',
  'zoom-fit': 'Shift+C',
  circle: 'Shift+Alt+C',
  'constrain-concentric': 'Shift+Ctrl+C',
};

/** Fusion 360's single-letter tools: L, R, C, T, E, F, M, Q, H. */
const FUSION: Bindings = {
  ...NATIVE,
  shell: 'Shift+H',
  scale: 'Shift+S',
  redo: 'Cmd+Y',
  'zoom-fit': 'F6',
};

/**
 * FreeCAD's Sketcher: constraints on single letters (C coincident, H and V horizontal and vertical,
 * P parallel, N perpendicular, T tangent, E equal) and the drawing tools behind a `G` prefix
 * (`G, L` a line). A sequence cannot be bound here, so Shift with the tool's letter stands in.
 * Views on the number row: 0 isometric, 1 front, 2 top, 3 right, 4 rear, 5 bottom, 6 left. Redo is
 * Ctrl+Y.
 */
const FREECAD: Bindings = {
  ...NATIVE,
  line: 'Shift+L',
  arc: 'Shift+A',
  rectangle: 'Shift+R',
  circle: 'Shift+C',
  trim: 'Shift+T',
  'constrain-coincident': 'C',
  'constrain-horizontal': 'H',
  'constrain-vertical': 'V',
  'constrain-parallel': 'P',
  'constrain-perpendicular': 'N',
  'constrain-tangent': 'T',
  'constrain-equal': 'E',
  'constrain-aligned': '',
  'constrain-concentric': '',
  'constrain-fix': '',
  extrude: '',
  fillet: '',
  shell: '',
  'move-rotate': '',
  scale: '',
  revolve: '',
  split: '',
  'view-reset': '0',
  'view-front': '1',
  'view-top': '2',
  'view-right': '3',
  'view-back': '4',
  'view-bottom': '5',
  'view-left': '6',
  redo: 'Cmd+Y',
};

/**
 * SolidWorks: the standard views on Ctrl+1 to Ctrl+7 (front, back, left, right, top, bottom,
 * isometric), F to zoom to fit, Space for the view orientation, Ctrl+Y to redo. It has no default
 * letters for sketch or feature tools, so those keep Native's, except F, which fits the view.
 */
const SOLIDWORKS: Bindings = {
  ...NATIVE,
  fillet: '',
  'view-front': 'Cmd+1',
  'view-back': 'Cmd+2',
  'view-left': 'Cmd+3',
  'view-right': 'Cmd+4',
  'view-top': 'Cmd+5',
  'view-bottom': 'Cmd+6',
  'view-reset': 'Cmd+7',
  'zoom-fit': 'F',
  redo: 'Cmd+Y',
};

/**
 * Onshape: L line, R rectangle, C circle, A arc, M trim; I coincident, H horizontal, V vertical, E
 * equal; Shift+E extrude, Shift+W revolve, Shift+F fillet; views on Shift+1 to Shift+7 (front,
 * back, left, right, top, bottom, isometric) and F to zoom to fit.
 */
const ONSHAPE: Bindings = {
  ...NATIVE,
  trim: 'M',
  'constrain-coincident': 'I',
  'constrain-horizontal': 'H',
  'constrain-vertical': 'V',
  'constrain-equal': 'E',
  'constrain-aligned': '',
  'constrain-parallel': '',
  'constrain-concentric': '',
  'constrain-fix': '',
  'constrain-perpendicular': '',
  'constrain-tangent': '',
  extrude: 'Shift+E',
  revolve: 'Shift+W',
  fillet: 'Shift+F',
  shell: '',
  'move-rotate': '',
  scale: '',
  split: '',
  'view-front': 'Shift+1',
  'view-back': 'Shift+2',
  'view-left': 'Shift+3',
  'view-right': 'Shift+4',
  'view-top': 'Shift+5',
  'view-bottom': 'Shift+6',
  'view-reset': 'Shift+7',
  'zoom-fit': 'F',
  redo: 'Cmd+Y',
};

/**
 * Inventor: L line, A arc, C circle, X trim; E extrude, R revolve, F fillet, H hole; F6 the home
 * view, Home to zoom to everything, Ctrl+Y to redo. R belongs to Revolve, so the rectangle has no
 * key.
 */
const INVENTOR: Bindings = {
  ...NATIVE,
  rectangle: '',
  trim: 'X',
  revolve: 'R',
  hole: 'H',
  shell: '',
  'move-rotate': '',
  scale: '',
  split: '',
  'view-reset': 'F6',
  'zoom-fit': 'Home',
  redo: 'Cmd+Y',
};

/**
 * Siemens NX: in a sketch L line, A arc, O circle, R rectangle, T quick trim; X extrude; Home the
 * trimetric view, Ctrl+Alt+F/T/R/L front, top, right and left; Ctrl+F to fit; F8 snaps to the
 * nearest square view; Ctrl+D deletes.
 */
const NX: Bindings = {
  ...NATIVE,
  circle: 'O',
  extrude: 'X',
  fillet: '',
  shell: '',
  'move-rotate': '',
  scale: '',
  revolve: '',
  split: '',
  'view-reset': 'Home',
  'view-front': 'Alt+Cmd+F',
  'view-top': 'Alt+Cmd+T',
  'view-right': 'Alt+Cmd+R',
  'view-left': 'Alt+Cmd+L',
  'view-back': '',
  'view-bottom': '',
  'view-square': 'F8',
  'zoom-fit': 'Cmd+F',
  redo: 'Cmd+Y',
  delete: 'Cmd+D',
  duplicate: '',
};

/**
 * SketchUp: L line, A arc, R rectangle, C circle, P push/pull (extrude), F offset, M move, Q
 * rotate, S scale, E eraser, Shift+Z zoom extents. F and T are Offset and the tape measure there,
 * so fillet and trim have no key.
 */
const SKETCHUP: Bindings = {
  ...NATIVE,
  trim: '',
  extrude: 'P',
  fillet: '',
  shell: '',
  'move-rotate': 'M',
  revolve: '',
  split: '',
  scale: 'S',
  'zoom-fit': 'Shift+Z',
  delete: 'E',
  redo: 'Cmd+Y',
};

/**
 * AutoCAD's one-letter command aliases (L line, A arc, C circle, F fillet, M move, E erase),
 * pressed directly instead of typed and confirmed with Return. Tools with longer aliases (REC, TR,
 * EXT, SC) have no key.
 */
const AUTOCAD: Bindings = {
  ...NATIVE,
  rectangle: '',
  trim: '',
  extrude: '',
  shell: '',
  'move-rotate': 'M',
  scale: '',
  revolve: '',
  split: '',
  delete: 'E',
  redo: 'Cmd+Y',
};

export const PRESET_BINDINGS: Record<KeymapPresetId, Bindings> = {
  native: NATIVE,
  blender: BLENDER,
  fusion360: FUSION,
  freecad: FREECAD,
  solidworks: SOLIDWORKS,
  onshape: ONSHAPE,
  inventor: INVENTOR,
  nx: NX,
  sketchup: SKETCHUP,
  autocad: AUTOCAD,
};

export const KEYMAP_PRESETS: readonly { id: KeymapPresetId; label: string }[] = [
  { id: 'native', label: 'Native' },
  { id: 'fusion360', label: 'Fusion 360' },
  { id: 'solidworks', label: 'SolidWorks' },
  { id: 'onshape', label: 'Onshape' },
  { id: 'inventor', label: 'Inventor' },
  { id: 'freecad', label: 'FreeCAD' },
  { id: 'nx', label: 'Siemens NX' },
  { id: 'blender', label: 'Blender' },
  { id: 'sketchup', label: 'SketchUp' },
  { id: 'autocad', label: 'AutoCAD' },
];
