/**
 * The history's steps as a list, oldest first: the same rows in the Items panel and in the History
 * sidebar. A step can be renamed, hidden, deleted, dragged to another place, and rolled back to.
 */

/// <reference lib="dom" />

import type { FeatureId, FeatureRecord, FeatureStatus } from '@bezier/core';
import { DeleteIcon, EyeIcon, EyeOffIcon, SketchIcon, stepIcon } from '@bezier/ui';
import { Fragment, useState } from 'react';
import { HistoryMarker } from './HistoryMarker.js';
import { HistoryMenu } from './HistoryMenu.js';

export interface HistoryStepsProps {
  features: readonly FeatureRecord[];
  /** The rows to list, when a filter narrows them. */
  shown?: readonly FeatureRecord[];
  statuses: ReadonlyMap<FeatureId, FeatureStatus>;
  selectedId: FeatureId | null;
  onSelect: (id: FeatureId) => void;
  onRename: (id: FeatureId, name: string) => void;
  onToggleSuppressed: (id: FeatureId, suppressed: boolean) => void;
  onDelete: (id: FeatureId) => void;
  onEditSketch: (id: FeatureId) => void;
  /** Rollback position: steps from this index on are paused. */
  rollback?: number | null;
  onRollback?: (at: number | null) => void;
  /** Moves a step to this index; the caller refuses a move above its dependencies. */
  onMove?: (id: FeatureId, toIndex: number) => void;
  /** Where a playhead drawn over the list stands: it replaces the marker and the notes. */
  head?: number;
  /** The pointer is on a step, or has left it. */
  onHover?: (id: FeatureId | null) => void;
}

/**
 * The message for an item that is not fine, or null. Exhaustive over `FeatureStatus`, so a new
 * status must decide how to explain itself; a silent broken row is what ADR 0009 forbids.
 */
function problemOf(status: FeatureStatus | undefined): string | null {
  switch (status?.state) {
    case undefined:
    case 'ok':
      return null;
    case 'suppressed':
      return 'Turned off';
    case 'failed':
    case 'blocked':
    case 'dangling':
    case 'unknown-type':
      return 'Not built';
  }
}

export function HistorySteps({
  features,
  shown,
  statuses,
  selectedId,
  onSelect,
  onRename,
  onToggleSuppressed,
  onDelete,
  onEditSketch,
  rollback = null,
  onRollback,
  onMove,
  head,
  onHover,
}: HistoryStepsProps) {
  const [renaming, setRenaming] = useState<FeatureId | null>(null);
  const [stepMenu, setStepMenu] = useState<{ id: FeatureId; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<FeatureId | null>(null);
  const [dropAt, setDropAt] = useState<{ id: FeatureId; below: boolean } | null>(null);
  const indexOf = (id: FeatureId) => features.findIndex((feature) => feature.id === id);
  const stops = head ?? rollback;

  return (
    <>
      <ul className="items-list">
        {(shown ?? features).map((feature) => {
          const status = statuses.get(feature.id);
          const index = indexOf(feature.id);
          // Below the marker a step is paused, not suppressed: rolling forward builds it.
          const paused = stops !== null && index >= stops;
          // `suppressed` here only means paused; a playhead over the list says that by itself.
          const problem = paused ? (head === undefined ? 'Paused' : null) : problemOf(status);
          return (
            <Fragment key={feature.id}>
              {head === undefined && rollback === index && onRollback !== undefined && (
                <HistoryMarker onResume={() => onRollback(null)} paused={features.length - index} />
              )}
              <li>
                {renaming === feature.id ? (
                  <input
                    aria-label={`Rename ${feature.name}`}
                    className="items-row items-row--input"
                    defaultValue={feature.name}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      setRenaming(null);
                      if (next !== '' && next !== feature.name) onRename(feature.id, next);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                      // Restore the old name before blurring, or the commit on blur saves the
                      // abandoned edit.
                      if (event.key === 'Escape') {
                        event.currentTarget.value = feature.name;
                        event.currentTarget.blur();
                      }
                    }}
                    // biome-ignore lint/a11y/noAutofocus: the field only exists once asked for
                    autoFocus
                    type="text"
                  />
                ) : (
                  // biome-ignore lint/a11y/noStaticElementInteractions: a drop target for dragging steps; the keyboard has Alt+arrows and the row's menu
                  <div
                    className="items-entry"
                    data-drop={
                      dropAt?.id === feature.id ? (dropAt.below ? 'below' : 'above') : undefined
                    }
                    data-hidden={feature.suppressed === true ? '' : undefined}
                    data-paused={paused ? '' : undefined}
                    draggable={onMove !== undefined}
                    onPointerEnter={() => onHover?.(feature.id)}
                    onPointerLeave={() => onHover?.(null)}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropAt(null);
                    }}
                    onDragOver={(event) => {
                      if (dragging === null || dragging === feature.id) return;
                      event.preventDefault();
                      const box = event.currentTarget.getBoundingClientRect();
                      setDropAt({
                        id: feature.id,
                        below: event.clientY > box.y + box.height / 2,
                      });
                    }}
                    onDragStart={(event) => {
                      setDragging(feature.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragging !== null && dropAt !== null && onMove !== undefined) {
                        // Index computed with the dragged step removed from the list.
                        const from = indexOf(dragging);
                        const target = indexOf(dropAt.id) + (dropAt.below ? 1 : 0);
                        onMove(dragging, target > from ? target - 1 : target);
                      }
                      setDragging(null);
                      setDropAt(null);
                    }}
                  >
                    <button
                      aria-current={feature.id === selectedId}
                      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                      className="items-row"
                      data-state={status?.state ?? 'ok'}
                      onClick={() => onSelect(feature.id)}
                      onContextMenu={(event) => {
                        if (onMove === undefined && onRollback === undefined) return;
                        event.preventDefault();
                        setStepMenu({ id: feature.id, x: event.clientX, y: event.clientY });
                      }}
                      // Keyboard reordering, alongside dragging.
                      onKeyDown={(event) => {
                        if (!event.altKey || onMove === undefined) return;
                        if (event.key === 'ArrowUp' && index > 0) onMove(feature.id, index - 1);
                        else if (event.key === 'ArrowDown' && index < features.length - 1)
                          onMove(feature.id, index + 1);
                        else return;
                        event.preventDefault();
                      }}
                      // Rename in place, like the project name in the title bar.
                      onDoubleClick={() => setRenaming(feature.id)}
                      type="button"
                    >
                      <span aria-hidden="true" className="items-row__icon">
                        {stepIcon(feature.type)}
                      </span>
                      <span className="items-row__text">
                        <span className="items-row__name">{feature.name}</span>
                        {/* A broken step is marked here; Nib says why (`use-run.ts`), and hovering repeats it. */}
                        {problem !== null && (
                          <span
                            className="items-row__problem"
                            role="status"
                            {...(status !== undefined && 'message' in status
                              ? { title: status.message }
                              : {})}
                          >
                            {problem}
                          </span>
                        )}
                      </span>
                    </button>
                    <span className="items-row__actions">
                      {feature.type === 'sketch' && (
                        <button
                          aria-label={`Edit ${feature.name}`}
                          onClick={() => onEditSketch(feature.id)}
                          title="Edit sketch"
                          type="button"
                        >
                          <SketchIcon />
                        </button>
                      )}
                      <button
                        aria-label={`${feature.suppressed === true ? 'Show' : 'Hide'} ${feature.name}`}
                        onClick={() => onToggleSuppressed(feature.id, feature.suppressed !== true)}
                        title={feature.suppressed === true ? 'Show' : 'Hide'}
                        type="button"
                      >
                        {feature.suppressed === true ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                      <button
                        aria-label={`Delete ${feature.name}`}
                        onClick={() => onDelete(feature.id)}
                        title="Delete"
                        type="button"
                      >
                        <DeleteIcon />
                      </button>
                    </span>
                  </div>
                )}
              </li>
            </Fragment>
          );
        })}
      </ul>
      {stepMenu !== null && (
        <HistoryMenu
          at={stepMenu}
          canDown={onMove !== undefined && indexOf(stepMenu.id) < features.length - 1}
          canUp={onMove !== undefined && indexOf(stepMenu.id) > 0}
          name={features[indexOf(stepMenu.id)]?.name ?? 'Step'}
          onClose={() => setStepMenu(null)}
          onDown={() => onMove?.(stepMenu.id, indexOf(stepMenu.id) + 1)}
          onRollBack={() => onRollback?.(indexOf(stepMenu.id) + 1)}
          onUp={() => onMove?.(stepMenu.id, indexOf(stepMenu.id) - 1)}
        />
      )}
    </>
  );
}
