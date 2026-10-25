/// <reference lib="dom" />

import type { SavedView } from '@bezier/core';
import {
  type DetailChoice,
  QUICK_SETTINGS,
  type RailGroup,
  RIGHT_RAIL,
  type ScrollDeviceChoice,
  type ThemeChoice,
  VIEW_TABS,
  ViewPanel,
  type ViewSettings,
  type ViewTab,
} from '@bezier/ui';
import { type MutableRefObject, useCallback, useRef, useState } from 'react';
import { type Run, SavedViews } from './SavedViews.js';
import type { ViewportHandle } from './Viewport.js';

/** The right rail: one button opening the quick settings, with its sections as tabs. */
export const rightRail: readonly RailGroup[] = RIGHT_RAIL;

/**
 * The sections the quick settings offer in a workspace. Visualize and Drawings have no modelling
 * camera, so no View; Visualize has no sketch grid or dimensions either, so no Units & Grid.
 */
export function viewTabsFor(workspace: string): readonly ViewTab[] {
  if (workspace === 'design' || workspace === 'simulation') return ['camera', 'display', 'units'];
  if (workspace === 'drawings') return ['display', 'units'];
  if (workspace === 'visualize') return ['display'];
  return [];
}

/** The right rail for a workspace: the quick settings, if they offer anything there. */
export function rightRailFor(workspace: string): readonly RailGroup[] {
  return viewTabsFor(workspace).length > 0 ? rightRail : [];
}

/** The section the quick settings open on: the last one viewed if offered here, else the first. */
export function quickTabFor(workspace: string, last: ViewTab | null): ViewTab | null {
  const tabs = viewTabsFor(workspace);
  return last !== null && tabs.includes(last) ? last : (tabs[0] ?? null);
}

const VIEW_TAB_IDS: readonly ViewTab[] = VIEW_TABS.map((tab) => tab.id);

export { QUICK_SETTINGS };

/**
 * Quick settings open state and section. Opens on the last viewed section; a section the new
 * workspace does not offer is closed on workspace change.
 */
export function useQuickSettings(workspace: string) {
  const [chosen, setTab] = useState<ViewTab | null>(null);
  const last = useRef<ViewTab | null>(null);
  if (chosen !== null) last.current = chosen;
  const tab = chosen !== null && viewTabsFor(workspace).includes(chosen) ? chosen : null;
  const activate = useCallback(
    (id: string) => {
      if (id !== QUICK_SETTINGS) return;
      setTab((current) => (current !== null ? null : quickTabFor(workspace, last.current)));
    },
    [workspace],
  );
  const close = useCallback(() => setTab(null), []);
  return { tab, setTab, activate, close };
}

/** Whether the active utility id names one of the view-panel tabs. */
export function isViewTab(id: string | null): id is ViewTab {
  return id !== null && (VIEW_TAB_IDS as readonly string[]).includes(id);
}

interface RightViewPanelDeps {
  /** The section shown; same id as the right-rail icon shown as current. */
  active: ViewTab;
  /** `app` omits modelling-view settings, for workspaces without one. */
  scope: 'model' | 'app';
  /** The workspace's rail sections, repeated as tabs across the panel's top. */
  tabs: readonly ViewTab[];
  onTab: (tab: ViewTab) => void;
  onClose: () => void;
  changeSettings: (patch: Partial<ViewSettings>) => void;
  setFitSignal: (updater: (n: number) => number) => void;
  settings: ViewSettings;
  viewportRef: MutableRefObject<ViewportHandle | null>;
  theme: ThemeChoice;
  onTheme: (theme: ThemeChoice) => void;
  detail: DetailChoice;
  onDetail: (detail: DetailChoice) => void;
  smoothness: number;
  onSmoothness: (smoothness: number) => void;
  scrollDevice: ScrollDeviceChoice;
  scrollSeen: 'mouse' | 'trackpad' | null;
  onScrollDevice: (device: ScrollDeviceChoice) => void;
  /** The document's saved views (`SavedViews.tsx`), below the standard ones. */
  savedViews: readonly SavedView[];
  run: Run;
}

/**
 * The panel behind every right-rail icon, docked at a fixed spot so switching tabs never moves it.
 * One-shot actions (picking a view, fitting) close it; changing a setting leaves it open.
 */
export function RightViewPanel({
  active,
  scope,
  tabs,
  onTab,
  onClose,
  changeSettings,
  setFitSignal,
  settings,
  viewportRef,
  theme,
  onTheme,
  detail,
  onDetail,
  smoothness,
  onSmoothness,
  scrollDevice,
  scrollSeen,
  onScrollDevice,
  savedViews,
  run,
}: RightViewPanelDeps) {
  return (
    <div className="view-panel-dock">
      <ViewPanel
        active={active}
        scope={scope}
        tabs={tabs}
        onTab={onTab}
        onChange={changeSettings}
        onClose={onClose}
        onFit={() => {
          setFitSignal((n) => n + 1);
          onClose();
        }}
        onView={(chosen) => {
          // Animate only here: squaring up from the Views list is a jump the user did not steer,
          // and the glide shows which way the part turned.
          viewportRef.current?.setView(chosen, settings.animateCamera);
          onClose();
        }}
        detail={detail}
        onDetail={onDetail}
        onScrollDevice={onScrollDevice}
        onSmoothness={onSmoothness}
        smoothness={smoothness}
        onTheme={onTheme}
        scrollDevice={scrollDevice}
        scrollSeen={scrollSeen}
        savedViews={
          <SavedViews onChosen={onClose} run={run} viewportRef={viewportRef} views={savedViews} />
        }
        settings={settings}
        theme={theme}
      />
    </div>
  );
}
