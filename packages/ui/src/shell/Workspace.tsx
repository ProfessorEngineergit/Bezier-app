/**
 * The app frame: title bar and a stage with a rail on each side. Layout only; no document,
 * selection or commands. Rail contents are passed in.
 */

import type { ReactNode } from 'react';
import { ImportIcon } from '../icons/Icons.js';
import type { RailGroup } from './Rail.js';
import { Rail } from './Rail.js';
import { TitleBar, type WorkspaceMode } from './TitleBar.js';
import type { RunningTask } from './task-progress.js';

export interface WorkspaceProps {
  projectName: string;
  /** Plan badge in the corner; absent when there is none. */
  badge?: string;
  leftGroups: readonly RailGroup[];
  rightGroups: readonly RailGroup[];
  activeLeftId: string | null;
  activeRightId: string | null;
  onActivateLeft: (id: string) => void;
  onActivateRight: (id: string) => void;
  showLabels?: boolean;
  showPerformance?: boolean;
  /** Right click on the title bar: toggles the performance graph. */
  onTogglePerformance?: () => void;
  /**
   * Whether the left rail currently shows labels, separate from the `showLabels` preference. Off
   * while a flyout is open. The right rail is unaffected.
   */
  leftLabels?: boolean;
  /**
   * True while a panel is docked to the left edge (Items). The left rail then moves beside it
   * instead of being covered. The panel itself comes in through `children` and is pinned in CSS.
   */
  leftPanel?: boolean;
  /** Opens the dashboard (home icon in the title bar). */
  onHome?: () => void;
  /** Export button handler. */
  onExport?: () => void;
  /** Extra title bar controls, before Export. */
  titleTrailing?: ReactNode;
  /** Rename in place; absent leaves the title as plain text. */
  onRename?: (name: string) => void;
  /** Project settings: the gear next to the name. */
  onSettings?: () => void;
  /** Running tasks, shown next to Export. Empty: no strip. */
  tasks?: readonly RunningTask[];
  /** Show notices as toasts under the bar; off while Nib shows them. */
  toasts?: boolean;
  /** True while a file is dragged over the window. The whole stage is the drop target. */
  dropping?: boolean;
  /** Notices and other content drawn above the canvas, outside the rails. */
  overlay?: ReactNode;
  /** The viewport and anything drawn over the canvas. */
  children?: ReactNode;
  /** Design, Simulation, ...; see `TitleBarProps.workspaces`. */
  workspaces?: readonly WorkspaceMode[];
  workspace?: string;
  onWorkspaceChange?: (id: string) => void;
}

export function Workspace({
  projectName,
  badge,
  leftGroups,
  rightGroups,
  activeLeftId,
  activeRightId,
  onActivateLeft,
  onActivateRight,
  showLabels = true,
  showPerformance = false,
  onTogglePerformance,
  leftLabels = true,
  leftPanel = false,
  onHome,
  onExport,
  titleTrailing,
  onRename,
  onSettings,
  tasks = [],
  toasts = true,
  dropping = false,
  overlay,
  children,
  workspaces,
  workspace,
  onWorkspaceChange,
}: WorkspaceProps) {
  return (
    <div className="workspace" data-workspace={workspace}>
      {/* Spread: with `exactOptionalPropertyTypes` an absent callback must be an absent key. */}
      <TitleBar
        projectName={projectName}
        tasks={tasks}
        toasts={toasts}
        showPerformance={showPerformance}
        {...(onTogglePerformance === undefined ? {} : { onTogglePerformance })}
        {...(badge === undefined ? {} : { badge })}
        {...(onHome === undefined ? {} : { onHome })}
        {...(onExport === undefined ? {} : { onExport })}
        {...(titleTrailing === undefined ? {} : { trailing: titleTrailing })}
        {...(onRename === undefined ? {} : { onRename })}
        {...(onSettings === undefined ? {} : { onSettings })}
        {...(workspaces === undefined ? {} : { workspaces })}
        {...(workspace === undefined ? {} : { workspace })}
        {...(onWorkspaceChange === undefined ? {} : { onWorkspaceChange })}
      />

      <div className="stage" data-left-panel={leftPanel ? '' : undefined}>
        {children}
        <Rail
          activeId={activeLeftId}
          ariaLabel="Tools"
          groups={leftGroups}
          onActivate={onActivateLeft}
          showLabels={showLabels && leftLabels}
          side="left"
        />
        <Rail
          activeId={activeRightId}
          ariaLabel="View and utilities"
          groups={rightGroups}
          onActivate={onActivateRight}
          showLabels={showLabels}
          side="right"
        />
        {overlay}
        {dropping && (
          <div className="dropzone">
            <span className="dropzone__label">
              <ImportIcon />
              Drop to import
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
