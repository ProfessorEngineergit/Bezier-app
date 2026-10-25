/**
 * The title bar: home button, workspace switcher, project name (renamed in place by clicking it),
 * running work, notifications and Export. Project deletion lives on the dashboard tile menu.
 */

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ExportIcon, HomeIcon } from '../icons/Icons.js';
import { NotificationCenter } from './NotificationCenter.js';
import { useNotificationFeed } from './notification-feed.js';
import { PerformanceGraph } from './PerformanceGraph.js';
import { Toasts } from './Toasts.js';
import type { RunningTask } from './task-progress.js';

export interface TitleBarProps {
  projectName: string;
  /** Plan badge in the corner; absent when there is none. */
  badge?: string;
  /** Accepts a new name. Absent: the name is plain text and not editable. */
  onRename?: (name: string) => void;
  /**
   * Leaves the project. Currently opens the dashboard in place; a multi-window build would close
   * the project window and focus the home window instead.
   */
  onHome?: () => void;
  onExport?: () => void;
  /** Extra controls before notifications and Export (e.g. Report a problem). */
  trailing?: ReactNode;
  tasks?: readonly RunningTask[];
  /** Show notices as toasts under the bar; off while Nib shows them. */
  toasts?: boolean;
  showPerformance?: boolean;
  /** Right click on the bar toggles the performance graph. */
  onTogglePerformance?: () => void;
  /** Workspaces for this project (Design, Simulation, ...). Absent hides the switcher. */
  workspaces?: readonly WorkspaceMode[];
  workspace?: string;
  onWorkspaceChange?: (id: string) => void;
}

export function TitleBar({
  projectName,
  badge,
  onRename,
  onHome,
  onExport,
  trailing,
  tasks = [],
  toasts = true,
  showPerformance = false,
  onTogglePerformance,
  workspaces,
  workspace,
  onWorkspaceChange,
}: TitleBarProps) {
  const notificationFeed = useNotificationFeed();

  return (
    // The whole bar drags the window in the desktop app; its buttons still work as buttons.
    // biome-ignore lint/a11y/noStaticElementInteractions: the same toggle is in Settings
    <header
      className="titlebar"
      data-tauri-drag-region=""
      onContextMenu={(event) => {
        // Text fields on the bar (the name while renaming) keep their own context menu.
        const target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
        if (onTogglePerformance === undefined) return;
        event.preventDefault();
        onTogglePerformance();
      }}
    >
      {badge !== undefined && (
        <button className="titlebar__badge" type="button">
          {badge}
        </button>
      )}

      <button aria-label="Projects" className="titlebar__icon" onClick={onHome} type="button">
        <HomeIcon />
      </button>

      {workspaces !== undefined && workspaces.length > 0 && (
        <WorkspaceSwitcher
          current={workspace ?? (workspaces[0] as WorkspaceMode).id}
          modes={workspaces}
          onChange={onWorkspaceChange}
        />
      )}

      <ProjectName name={projectName} onRename={onRename} />

      {/* Empty part of the bar, used to drag the window. */}
      <span className="titlebar__free" data-tauri-drag-region="" />
      {showPerformance && <PerformanceGraph />}
      {trailing}
      <NotificationCenter tasks={tasks} />
      {toasts && (
        <Toasts notices={notificationFeed.notices} onDismiss={notificationFeed.onDismiss} />
      )}

      <button className="titlebar__export" onClick={onExport} type="button">
        <ExportIcon />
        Export
      </button>
    </header>
  );
}

/**
 * `onRename` is required but may be `undefined`: with `exactOptionalPropertyTypes` an optional
 * prop cannot receive an explicit `undefined`, and the caller forwards a possibly absent callback.
 */
interface ProjectNameProps {
  name: string;
  onRename: ((name: string) => void) | undefined;
}

function ProjectName({ name, onRename }: ProjectNameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const input = useRef<HTMLInputElement>(null);

  /**
   * Focus before selecting: the clicked button was just unmounted, so focus is on the body, and a
   * selection in an unfocused field swallows keystrokes. The whole name is selected because most
   * renames replace it.
   */
  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  if (onRename === undefined) return <span className="titlebar__name">{name}</span>;

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    // Ignore an empty name and keep the old one.
    if (trimmed === '' || trimmed === name) return;
    onRename(trimmed);
  };

  if (editing) {
    return (
      // The field grows with its text: a hidden copy of the text (`data-value`) sizes the grid cell
      // the input fills.
      <span className="titlebar__nameField" data-value={`${draft} `}>
        <input
          aria-label="Project name"
          className="titlebar__nameInput"
          onBlur={commit}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') {
              setDraft(name);
              setEditing(false);
            }
          }}
          ref={input}
          size={1}
          spellCheck={false}
          type="text"
          value={draft}
        />
      </span>
    );
  }

  return (
    <button
      className="titlebar__name"
      onClick={() => {
        // A project still loading has no history to record a rename in, so the rename would be
        // lost. The loading screen sets `data-loading-below-bar`.
        if (document.documentElement.hasAttribute('data-loading-below-bar')) return;
        setDraft(name);
        setEditing(true);
      }}
      title="Rename"
      type="button"
    >
      {name}
    </button>
  );
}

/** A workspace the project can be opened in. */
export interface WorkspaceMode {
  id: string;
  label: string;
  icon: ReactNode;
  /** One-line description shown in the menu. */
  note: string;
  /** False for workspaces not built yet: listed but disabled. */
  available: boolean;
}

/**
 * Switches between workspaces (Design, Simulation, ...) at the start of the bar, as in Fusion.
 * Workspaces not built yet are listed as disabled rather than hidden.
 */
function WorkspaceSwitcher({
  modes,
  current,
  onChange,
}: {
  modes: readonly WorkspaceMode[];
  current: string;
  onChange: ((id: string) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const active = modes.find((mode) => mode.id === current) ?? (modes[0] as WorkspaceMode);

  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)')
      ?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const items = [
        ...(root.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitemradio"]:not(:disabled)',
        ) ?? []),
      ];
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = (at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      items[next]?.focus();
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div className="titlebar__workspace" ref={root}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Workspace: ${active.label}`}
        className="titlebar__workspaceButton"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {active.icon}
        <span>{active.label}</span>
        <svg aria-hidden="true" height="10" viewBox="0 0 10 10" width="10">
          <path
            d="M2.5 4 5 6.5 7.5 4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.4"
          />
        </svg>
      </button>
      {open && (
        <div
          aria-label="Workspaces"
          className="menu menu--wide titlebar__workspaceMenu"
          role="menu"
        >
          {modes.map((mode) => (
            <button
              aria-checked={mode.id === active.id}
              className="menu__item menu__item--stacked titlebar__workspaceItem"
              disabled={!mode.available}
              key={mode.id}
              onClick={() => {
                setOpen(false);
                if (mode.id !== active.id) onChange?.(mode.id);
              }}
              role="menuitemradio"
              type="button"
            >
              <span className="menu__itemLabel">
                {mode.icon}
                {mode.label}
                {!mode.available && <small>Soon</small>}
              </span>
              <span className="menu__itemNote">{mode.note}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
