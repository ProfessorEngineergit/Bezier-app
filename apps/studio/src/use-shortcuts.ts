/**
 * Keyboard handling through the active keymap (`keymap.ts` in `@bezier/ui`), which maps keys to
 * actions; this decides what each action does and when it applies. Some keys are fixed: digits type
 * a length while drawing, Escape backs out one step, Enter finishes a sketch, Ctrl+Y redoes on
 * Windows keyboards and Alt+Cmd+1 to 4 switch workspace.
 */

import type { CubeSide } from '@bezier/renderer';
import { type CategoryId, type ConstraintTool, matchesShortcut, type Shortcut } from '@bezier/ui';
import { type Dispatch, type RefObject, type SetStateAction, useEffect } from 'react';
import type { SketchState } from './use-sketch.js';
import type { StudioMode } from './workspaces/WorkspaceModes.js';

type Vec3 = { x: number; y: number; z: number };

interface ShortcutDeps {
  keymap: ReadonlyMap<string, Shortcut>;
  activateLeft: (id: string) => void;
  category: CategoryId | null;
  measureMode: boolean;
  prefsOpen: boolean;
  /** The project library has the keyboard while the editor sits behind it. */
  inactive: boolean;
  workspace: StudioMode;
  onSketchCommand: (id: string) => void;
  /** Withdraws the offer on a clicked profile, if any. Reports whether it did. */
  cancelOffer: () => boolean;
  /** Stops a change still being built. Reports whether there was one. */
  cancelBuild: () => boolean;
  setMeasureMode: Dispatch<SetStateAction<boolean>>;
  setMeasurePoints: Dispatch<SetStateAction<readonly Vec3[]>>;
  setPrefsOpen: Dispatch<SetStateAction<boolean>>;
  /** Closes Settings, returning to where it was opened from. */
  onCloseSettings: () => void;
  sketchRef: RefObject<SketchState>;
  /** Clears the selection; true when there was one. */
  onDeselect: () => boolean;
  onSelectAll: () => void;
  onStepHistory: (direction: 'undo' | 'redo') => void;
  onDuplicate: () => void;
  /** Deletes the selection: a picked history step, or whole bodies. */
  onDelete: () => void;
  onCombine: (operation: 'join' | 'cut' | 'intersect') => void;
  onView: (view: CubeSide | 'default') => void;
  /** Squares the view to the last cube side picked, Top until one was. */
  onSquareView: () => void;
  onZoomFit: () => void;
  onFilterCycle: () => void;
  onVariables: () => void;
  /** Switches workspace by position, for Alt+Cmd+1 to 4. */
  onWorkspaceIndex: (index: number) => void;
  onHome: () => void;
}

const SKETCH_TOOLS = new Set(['line', 'arc', 'circle', 'rectangle', 'trim']);
const MODEL_TOOLS = new Set([
  'extrude',
  'fillet',
  'shell',
  'hole',
  'move-rotate',
  'scale',
  'mirror',
  'pattern',
  'revolve',
  'split',
]);
const VIEWS: Record<string, CubeSide | 'default'> = {
  'view-reset': 'default',
  'view-front': 'front',
  'view-back': 'back',
  'view-top': 'top',
  'view-bottom': 'bottom',
  'view-right': 'right',
  'view-left': 'left',
};

/** Routes global keys through the same command path as the rails. */
export function useShortcuts(deps: ShortcutDeps): void {
  const {
    keymap,
    activateLeft,
    category,
    measureMode,
    prefsOpen,
    inactive,
    workspace,
    onSketchCommand,
    cancelOffer,
    cancelBuild,
    setMeasureMode,
    setMeasurePoints,
    setPrefsOpen,
    onCloseSettings,
    sketchRef,
    onDeselect,
    onSelectAll,
    onStepHistory,
    onDuplicate,
    onDelete,
    onCombine,
    onView,
    onSquareView,
    onZoomFit,
    onFilterCycle,
    onVariables,
    onWorkspaceIndex,
    onHome,
  } = deps;

  useEffect(() => {
    const sketching = category === 'sketch';

    /** Performs the action here. False when it does not apply now. */
    const run = (action: string): boolean => {
      if (action === 'settings') {
        if (prefsOpen) onCloseSettings();
        else setPrefsOpen(true);
        return true;
      }
      if (action === 'home') {
        onHome();
        return true;
      }
      if (inactive) return false;
      if (action === 'undo') {
        // An open sketch is not journalled yet, so undo removes the last drawn line rather than the
        // last feature.
        if (sketching && sketchRef.current.undoLast()) return true;
        onStepHistory('undo');
        return true;
      }
      if (action === 'redo') {
        onStepHistory('redo');
        return true;
      }
      if (SKETCH_TOOLS.has(action)) {
        onSketchCommand(action);
        return true;
      }
      if (action.startsWith('constrain-')) {
        if (!sketching) return false;
        sketchRef.current.constrainSelection(action.slice('constrain-'.length) as ConstraintTool);
        return true;
      }
      if (workspace !== 'design') return false;
      if (action === 'delete') {
        if (sketching) activateLeft('sketch-delete');
        else onDelete();
        return true;
      }
      if (MODEL_TOOLS.has(action)) {
        activateLeft(action);
        return true;
      }
      if (action === 'union' || action === 'subtract' || action === 'intersect') {
        onCombine(action === 'union' ? 'join' : action === 'subtract' ? 'cut' : 'intersect');
        return true;
      }
      const view = VIEWS[action];
      if (view !== undefined) {
        onView(view);
        return true;
      }
      if (action === 'view-square') onSquareView();
      else if (action === 'zoom-fit') onZoomFit();
      else if (action === 'duplicate') onDuplicate();
      else if (action === 'select-all') onSelectAll();
      else if (action === 'deselect') onDeselect();
      else if (action === 'filter-cycle') onFilterCycle();
      else if (action === 'variables') onVariables();
      else if (action === 'items') activateLeft('items');
      else if (action === 'import') activateLeft('file');
      else return false;
      return true;
    };

    const onKey = (event: KeyboardEvent) => {
      // Before the field exemption below: a user who just typed a value and sees the model grinding
      // still has the field focused.
      if (event.key === 'Escape' && !inactive && cancelBuild()) {
        event.preventDefault();
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Digits go to the shape being drawn, before the keymap, so a length cannot also trigger a
      // tool or view on the same key.
      if (
        !inactive &&
        sketching &&
        workspace === 'design' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        sketchRef.current.typeLength(event.key)
      ) {
        event.preventDefault();
        return;
      }
      if (event.altKey && (event.metaKey || event.ctrlKey) && /^Digit[1-4]$/.test(event.code)) {
        event.preventDefault();
        onWorkspaceIndex(Number(event.code.slice(5)) - 1);
        return;
      }
      if (!inactive && event.key.toLowerCase() === 'y' && event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        onStepHistory('redo');
        return;
      }
      // Enter on a focused button presses it (view cube edge, panel control) without also ending
      // the sketch.
      const onButton =
        target instanceof Element && target.closest('button, [role="button"]') !== null;
      if (!inactive && event.key === 'Enter' && sketching && !onButton) {
        event.preventDefault();
        activateLeft('exit');
        return;
      }
      if (event.key === 'Escape') {
        // When Escape is handled here, prevent the default so the window does not also leave full
        // screen (in the desktop app one press did both). Unhandled, it goes to the window.
        const taken = () => event.preventDefault();
        if (prefsOpen) {
          taken();
          onCloseSettings();
          return;
        }
        // An open panel closes itself on Escape; handling it here too would also finish the sketch.
        if (document.querySelector('.work-panel, .popover, .sketch-action-bar') !== null) {
          taken();
          return;
        }
        // An offer on a clicked profile takes precedence over clearing the selection: it is newer
        // and more transient.
        if (cancelOffer()) {
          taken();
          return;
        }
        if (measureMode) {
          taken();
          setMeasureMode(false);
          setMeasurePoints([]);
          return;
        }
        if (sketchRef.current.pending.length > 0) {
          taken();
          sketchRef.current.cancelShape();
          return;
        }
        if (sketchRef.current.tool !== null) {
          taken();
          sketchRef.current.setTool(null);
          return;
        }
        // With nothing else to drop, Escape leaves the sketch.
        if (sketching) {
          taken();
          activateLeft('exit');
          return;
        }
        if (onDeselect()) taken();
        return;
      }
      if (event.repeat) return;
      // With Settings open only its own key works; the rest of the keymap belongs to the hidden
      // editor.
      if (prefsOpen) {
        const toggle = keymap.get('settings');
        if (toggle !== undefined && matchesShortcut(toggle, event)) {
          event.preventDefault();
          run('settings');
        }
        return;
      }

      for (const [action, key] of keymap) {
        const matched =
          matchesShortcut(key, event) ||
          // Backspace and Delete are the same key on different keyboards.
          (action === 'delete' && key === 'Backspace' && event.key === 'Delete' && !event.metaKey);
        if (!matched) continue;
        if (run(action)) {
          event.preventDefault();
          return;
        }
      }
    };

    // The desktop menu runs actions by name (`bezier:action`) for keys macOS keeps from the page,
    // such as Command with a digit.
    const onAction = (event: Event) => {
      const action = (event as CustomEvent<unknown>).detail;
      if (typeof action === 'string') run(action);
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('bezier:action', onAction);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('bezier:action', onAction);
    };
  }, [
    keymap,
    activateLeft,
    cancelOffer,
    cancelBuild,
    category,
    inactive,
    workspace,
    onSketchCommand,
    measureMode,
    onDeselect,
    onDuplicate,
    onDelete,
    onCombine,
    onView,
    onSquareView,
    onZoomFit,
    onFilterCycle,
    onVariables,
    onSelectAll,
    onHome,
    onStepHistory,
    onWorkspaceIndex,
    prefsOpen,
    setMeasureMode,
    setMeasurePoints,
    setPrefsOpen,
    onCloseSettings,
    sketchRef,
  ]);
}
