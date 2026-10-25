/**
 * Editor keys that have no rail button (undo, deselect, leaving a mode), listed so Settings can
 * show them. Tool shortcuts live in the command catalogue. A test reads `use-shortcuts.ts` to keep
 * this list and the handler in sync.
 */

export interface EditorShortcut {
  keys: string;
  label: string;
  /** When it applies, for keys that are not always active. */
  scope?: string;
}

export const EDITOR_SHORTCUTS: readonly EditorShortcut[] = [
  { keys: 'Enter', label: 'Finish sketch', scope: 'Sketching' },
  {
    keys: 'Escape',
    label:
      'Back out: close settings, drop an offer, cancel a shape, put a tool away, leave the sketch',
  },
  { keys: '0–9', label: 'Type an exact length', scope: 'While drawing' },
  { keys: 'Ctrl+Y', label: 'Redo', scope: 'Windows keyboards' },
  { keys: 'Delete', label: 'Delete, the same as Backspace' },
  { keys: 'Alt+Cmd+1–4', label: 'Switch workspace' },
];
