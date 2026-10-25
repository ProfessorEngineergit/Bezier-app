/**
 * All keyboard shortcuts as named actions with a key per preset, read by the key handler, rail
 * keycaps and Settings. Users can override any key.
 *
 * Native preset: single-letter tools, Shift+letter constraints, Cmd+U/B/I for booleans, Cmd+1 to
 * Cmd+7 for views, Tab cycles the selection filter. Space aligns the view to the face under the
 * pointer and centres it; over no face, to the last side picked on the view cube (default Top).
 */

import { type KeymapPresetId, NATIVE, PRESET_BINDINGS } from './keymap-presets.js';
import type { Shortcut } from './shortcut.js';

export { KEYMAP_PRESETS, type KeymapPresetId } from './keymap-presets.js';

export type KeyActionGroup =
  | 'Sketch'
  | 'Constraints'
  | 'Modeling'
  | 'View'
  | 'Edit'
  | 'Selection'
  | 'App';

export interface KeyAction {
  id: string;
  label: string;
  group: KeyActionGroup;
}

export const KEY_ACTIONS: readonly KeyAction[] = [
  { id: 'line', label: 'Line', group: 'Sketch' },
  { id: 'arc', label: 'Arc', group: 'Sketch' },
  { id: 'rectangle', label: 'Rectangle', group: 'Sketch' },
  { id: 'circle', label: 'Circle', group: 'Sketch' },
  { id: 'trim', label: 'Trim', group: 'Sketch' },
  { id: 'constrain-parallel', label: 'Parallel', group: 'Constraints' },
  { id: 'constrain-concentric', label: 'Concentric', group: 'Constraints' },
  { id: 'constrain-equal', label: 'Equal', group: 'Constraints' },
  { id: 'constrain-aligned', label: 'Horizontal/Vertical', group: 'Constraints' },
  { id: 'constrain-horizontal', label: 'Horizontal', group: 'Constraints' },
  { id: 'constrain-vertical', label: 'Vertical', group: 'Constraints' },
  { id: 'constrain-coincident', label: 'Coincident', group: 'Constraints' },
  { id: 'constrain-fix', label: 'Lock', group: 'Constraints' },
  { id: 'constrain-perpendicular', label: 'Perpendicular', group: 'Constraints' },
  { id: 'constrain-angle', label: 'Angle', group: 'Constraints' },
  { id: 'constrain-tangent', label: 'Tangent', group: 'Constraints' },
  { id: 'extrude', label: 'Extrude', group: 'Modeling' },
  { id: 'fillet', label: 'Chamfer/Fillet', group: 'Modeling' },
  { id: 'shell', label: 'Shell', group: 'Modeling' },
  { id: 'hole', label: 'Hole', group: 'Modeling' },
  { id: 'move-rotate', label: 'Move/Rotate', group: 'Modeling' },
  { id: 'scale', label: 'Scale', group: 'Modeling' },
  { id: 'mirror', label: 'Mirror', group: 'Modeling' },
  { id: 'pattern', label: 'Pattern', group: 'Modeling' },
  { id: 'align', label: 'Align', group: 'Modeling' },
  { id: 'joint', label: 'Joint', group: 'Modeling' },
  { id: 'revolve', label: 'Revolve', group: 'Modeling' },
  { id: 'loft', label: 'Loft', group: 'Modeling' },
  { id: 'sweep', label: 'Sweep', group: 'Modeling' },
  { id: 'wrap', label: 'Wrap', group: 'Modeling' },
  { id: 'split', label: 'Split', group: 'Modeling' },
  { id: 'union', label: 'Union', group: 'Modeling' },
  { id: 'subtract', label: 'Subtract', group: 'Modeling' },
  { id: 'intersect', label: 'Intersect', group: 'Modeling' },
  { id: 'view-reset', label: 'Reset view', group: 'View' },
  { id: 'view-front', label: 'Front view', group: 'View' },
  { id: 'view-back', label: 'Back view', group: 'View' },
  { id: 'view-top', label: 'Top view', group: 'View' },
  { id: 'view-bottom', label: 'Bottom view', group: 'View' },
  { id: 'view-right', label: 'Right view', group: 'View' },
  { id: 'view-left', label: 'Left view', group: 'View' },
  { id: 'view-square', label: 'Square up to the last cube side', group: 'View' },
  { id: 'zoom-fit', label: 'Zoom to fit', group: 'View' },
  { id: 'undo', label: 'Undo', group: 'Edit' },
  { id: 'redo', label: 'Redo', group: 'Edit' },
  { id: 'delete', label: 'Delete', group: 'Edit' },
  { id: 'duplicate', label: 'Duplicate', group: 'Edit' },
  { id: 'select-all', label: 'Select all', group: 'Selection' },
  { id: 'deselect', label: 'Deselect all', group: 'Selection' },
  { id: 'filter-cycle', label: 'Cycle selection filter', group: 'Selection' },
  { id: 'items', label: 'Show/hide Items', group: 'App' },
  { id: 'variables', label: 'Show/hide Variables', group: 'App' },
  { id: 'import', label: 'Import file', group: 'App' },
  { id: 'settings', label: 'Settings', group: 'App' },
  { id: 'home', label: 'Back to the projects', group: 'App' },
];

/** Effective key per action: the preset's, with user overrides. An override of '' means no key. */
export function resolveKeymap(
  preset: KeymapPresetId,
  overrides: Readonly<Record<string, Shortcut>>,
): ReadonlyMap<string, Shortcut> {
  const base = PRESET_BINDINGS[preset] ?? NATIVE;
  const resolved = new Map<string, Shortcut>();
  for (const action of KEY_ACTIONS) {
    const key = overrides[action.id] ?? base[action.id];
    if (key !== undefined && key !== '') resolved.set(action.id, key);
  }
  return resolved;
}

/** Actions sharing a key, so Settings can show which one wins. */
export function keyConflicts(keymap: ReadonlyMap<string, Shortcut>): ReadonlyMap<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const [action, key] of keymap) {
    const normal = key.toUpperCase();
    byKey.set(normal, [...(byKey.get(normal) ?? []), action]);
  }
  return new Map([...byKey].filter(([, actions]) => actions.length > 1));
}

/** The active keymap, read by rail keycaps. Set by the app from Settings. */
let active: ReadonlyMap<string, Shortcut> = resolveKeymap('native', {});

export function setActiveKeymap(keymap: ReadonlyMap<string, Shortcut>): void {
  active = keymap;
}

export function activeKeymap(): ReadonlyMap<string, Shortcut> {
  return active;
}
