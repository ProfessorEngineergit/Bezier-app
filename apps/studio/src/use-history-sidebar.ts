/** Whether the History sidebar is open, and its width. It makes room through `--side-panel`. */

import type { CadDocument, FeatureId } from '@bezier/core';
import { useCallback, useState } from 'react';
import { HISTORY_WIDTH_DEFAULT, HISTORY_WIDTH_MAX, HISTORY_WIDTH_MIN } from './HistorySidebar.js';
import type { SessionView } from './session.js';
import type { TimelapseCue } from './timelapse-script.js';
import { useStoredWidth } from './use-stored-width.js';
import { useSidePanel } from './workspaces/use-side-panel.js';

const LIMITS = {
  key: 'bezier.history.panel-width',
  initial: HISTORY_WIDTH_DEFAULT,
  min: HISTORY_WIDTH_MIN,
  max: HISTORY_WIDTH_MAX,
};

export function useHistorySidebar(available: boolean) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useStoredWidth(LIMITS);
  // While a timelapse plays, the rail shows what it says and not what is really open.
  const [cue, setCue] = useState<TimelapseCue | null>(null);
  const shown = open && available;
  useSidePanel(width, shown);
  const toggle = useCallback(() => setOpen((was) => !was), []);
  const sidebar = { onCue: setCue, width, onWidthChange: setWidth };
  return { shown, toggle, cue, sidebar };
}

interface StepActions {
  deselectAll: () => void;
  mode: { edit: (id: FeatureId) => void };
  removeFeature: (id: FeatureId) => void;
  renameFeature: (id: FeatureId, name: string) => void;
  setSuppressed: (id: FeatureId, suppressed: boolean) => void;
}

/** What the Items panel and the History sidebar both list and do. */
export function stepProps(
  selected: FeatureId | null,
  select: (id: FeatureId | null) => void,
  actions: StepActions,
) {
  return (document: CadDocument, view: SessionView) => ({
    features: document.features,
    onDelete: (id: FeatureId) => {
      if (selected === id) select(null);
      actions.removeFeature(id);
    },
    onEditSketch: actions.mode.edit,
    onRename: actions.renameFeature,
    onSelect: (id: FeatureId) => {
      actions.deselectAll();
      select(id);
    },
    onToggleSuppressed: actions.setSuppressed,
    selectedId: selected,
    statuses: view.statuses,
  });
}
