/**
 * The Items panel, floating at the left edge (the rail steps aside via `data-left-panel` in the
 * app stylesheet). Lists the document's bodies (ADR 0012, rows in `BodyList`) above the features
 * that built them. The filter narrows to sketches or bodies; an empty document shows a message
 * instead of a bare list.
 */

/// <reference lib="dom" />

import type { BodySummary, FeatureId, FeatureRecord, FeatureStatus } from '@bezier/core';
import { DeleteIcon, EyeIcon, EyeOffIcon, ModelingIcon, SketchIcon } from '@bezier/ui';
import { Fragment, useEffect, useRef, useState } from 'react';
import { BodyList } from './BodyList.js';
import { HistoryMarker } from './HistoryMarker.js';
import { HistoryMenu } from './HistoryMenu.js';
import './history.css';
import { ItemsTree } from './ItemsTree.js';
import { ResizeHandle } from './ResizeHandle.js';

export const ITEMS_WIDTH_DEFAULT = 262;
export const ITEMS_WIDTH_MIN = 208;
export const ITEMS_WIDTH_MAX = 420;

/** Which group of things the list is narrowed to. */
export type ItemsFilter = 'all' | 'sketches' | 'bodies';

const FILTERS: readonly { id: ItemsFilter; label: string }[] = [
  { id: 'all', label: 'All Items' },
  { id: 'sketches', label: 'Sketches' },
  { id: 'bodies', label: 'Bodies' },
];

/** What the filter button reads, for a filter that is always one of the three. */
const LABELS: Record<ItemsFilter, string> = {
  all: 'All Items',
  sketches: 'Sketches',
  bodies: 'Bodies',
};

export interface ItemsPanelProps {
  features: readonly FeatureRecord[];
  statuses: ReadonlyMap<FeatureId, FeatureStatus>;
  selectedId: FeatureId | null;
  onSelect: (id: FeatureId) => void;
  onRename: (id: FeatureId, name: string) => void;
  /** Show or hide what this item contributes, without deleting it. */
  onToggleSuppressed: (id: FeatureId, suppressed: boolean) => void;
  /** The sketches currently drawn in the model, so hidden ones can be marked. */
  shownSketches?: ReadonlySet<string>;
  onDelete: (id: FeatureId) => void;
  /** Reopens a sketch for drawing, so Finish writes back to it. */
  onEditSketch: (id: FeatureId) => void;
  /** Rollback position: steps from this index on are paused. */
  rollback?: number | null;
  onRollback?: (at: number | null) => void;
  /** Moves a step to this index; the caller refuses a move above its dependencies. */
  onMove?: (id: FeatureId, toIndex: number) => void;
  /** The separate bodies, hidden ones included. */
  bodies: readonly BodySummary[];
  /** Keys of the bodies the current selection touches. */
  selectedBodies: ReadonlySet<string>;
  onSelectBody: (key: string, additive: boolean) => void;
  onSelectBodies: (keys: readonly string[], additive: boolean) => void;
  onToggleBodyVisible: (key: string, visible: boolean) => void;
  /** Show or hide several bodies as one step. */
  onBodiesVisible?: (keys: readonly string[], visible: boolean) => void;
  /** Also list the history steps (a developer setting). */
  showHistory?: boolean;
  /** Lists only this group, with no filter control. Visualize lists only bodies. */
  only?: 'bodies' | undefined;
  /** Folder name by body key. */
  bodyFolders?: Readonly<Record<string, string>>;
  onBodyFolder?: (key: string, folder: string) => void;
  onIsolateBody?: (key: string) => void;
  onBodyFolderVisible?: (folder: string, visible: boolean) => void;
  onRemoveBody: (key: string) => void;
  onRenameBody: (key: string, name: string) => void;
  width: number;
  onWidthChange: (width: number) => void;
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
      return status.message;
  }
}

/** Whether a feature is a sketch; everything else builds or changes the solid. */
function isSketch(feature: FeatureRecord): boolean {
  return feature.type === 'sketch';
}

export function ItemsPanel({
  features,
  statuses,
  selectedId,
  onSelect,
  onRename,
  onToggleSuppressed,
  shownSketches,
  onDelete,
  onEditSketch,
  rollback = null,
  onRollback,
  onMove,
  bodies,
  selectedBodies,
  onSelectBody,
  onSelectBodies,
  onToggleBodyVisible,
  onBodiesVisible,
  showHistory = false,
  only,
  bodyFolders,
  onBodyFolder,
  onIsolateBody,
  onBodyFolderVisible,
  onRemoveBody,
  onRenameBody,
  width,
  onWidthChange,
}: ItemsPanelProps) {
  const [chosenFilter, setFilter] = useState<ItemsFilter>('all');
  const filter: ItemsFilter = only ?? chosenFilter;
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState<FeatureId | null>(null);
  const [stepMenu, setStepMenu] = useState<{ id: FeatureId; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<FeatureId | null>(null);
  const [dropAt, setDropAt] = useState<{ id: FeatureId; below: boolean } | null>(null);
  const indexOf = (id: FeatureId) => features.findIndex((feature) => feature.id === id);
  const filterRef = useRef<HTMLButtonElement | null>(null);

  const shown = features.filter((feature) =>
    filter === 'all' ? true : filter === 'sketches' ? isSketch(feature) : !isSketch(feature),
  );
  const bodiesShown = filter === 'sketches' ? [] : bodies;
  // Headings only when there are two lists to tell apart.
  const headed = bodiesShown.length > 0 && shown.length > 0;

  // Dismiss on a press anywhere else, like other menus.
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (filterRef.current?.parentElement?.contains(event.target) === true) return;
      setMenuOpen(false);
    };
    window.addEventListener('pointerdown', dismiss);
    return () => window.removeEventListener('pointerdown', dismiss);
  }, [menuOpen]);

  return (
    <aside aria-label="Items" className="items-panel" style={{ width: `${width}px` }}>
      <header className="items-panel__head">
        <h2>Items</h2>
      </header>

      <div className="items-panel__filter-wrap" hidden={only !== undefined}>
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="items-panel__filter"
          onClick={() => setMenuOpen((open) => !open)}
          ref={filterRef}
          type="button"
        >
          <span>{LABELS[filter]}</span>
          <span aria-hidden="true" className="items-panel__chevron">
            ⌄
          </span>
        </button>

        {menuOpen && (
          <div className="items-panel__menu" role="menu">
            {FILTERS.map((entry) => (
              <button
                aria-checked={entry.id === filter}
                className="items-panel__menu-item"
                key={entry.id}
                onClick={() => {
                  setFilter(entry.id);
                  setMenuOpen(false);
                  filterRef.current?.focus();
                }}
                role="menuitemradio"
                type="button"
              >
                <span className="items-panel__tick">{entry.id === filter ? '✓' : ''}</span>
                {entry.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="items-panel__body">
        {!showHistory || only !== undefined ? (
          <ItemsTree
            bodies={bodies}
            features={features}
            filter={filter}
            folders={bodyFolders ?? {}}
            onBodiesVisible={
              onBodiesVisible ??
              ((keys, visible) => {
                for (const key of keys) onToggleBodyVisible(key, visible);
              })
            }
            onEditSketch={onEditSketch}
            {...(onIsolateBody !== undefined ? { onIsolateBody } : {})}
            onRenameBody={onRenameBody}
            onSelect={onSelect}
            onSelectBodies={onSelectBodies}
            onSelectBody={onSelectBody}
            onToggleSuppressed={onToggleSuppressed}
            {...(shownSketches !== undefined ? { shownSketches } : {})}
            selectedBodies={selectedBodies}
            selectedId={selectedId}
          />
        ) : features.length === 0 ? (
          <div className="items-panel__empty">
            <p className="items-panel__emptyTitle">Workspace is empty</p>
            <p className="items-panel__emptyNote">Start modeling to view your items here</p>
          </div>
        ) : shown.length === 0 ? (
          // The filter matches nothing. Say which group is empty, distinct from the empty-document
          // message, since the fix is changing the filter.
          <div className="items-panel__empty">
            <p className="items-panel__emptyTitle">
              No {filter === 'sketches' ? 'sketches' : 'bodies'} yet
            </p>
            <p className="items-panel__emptyNote">
              {filter === 'sketches'
                ? 'Draw one to see it here'
                : 'Extrude or revolve a sketch to see it here'}
            </p>
          </div>
        ) : (
          <>
            {headed && <h3 className="items-section">Bodies</h3>}
            {bodiesShown.length > 0 && (
              <BodyList
                bodies={bodiesShown}
                onRemove={onRemoveBody}
                onRename={onRenameBody}
                onSelect={onSelectBody}
                onToggleVisible={onToggleBodyVisible}
                selected={selectedBodies}
                {...(bodyFolders !== undefined ? { folders: bodyFolders } : {})}
                {...(onBodyFolder !== undefined ? { onFolder: onBodyFolder } : {})}
                {...(onIsolateBody !== undefined ? { onIsolate: onIsolateBody } : {})}
                {...(onBodyFolderVisible !== undefined
                  ? { onFolderVisible: onBodyFolderVisible }
                  : {})}
              />
            )}
            {headed && <h3 className="items-section">History</h3>}
            <ul className="items-list">
              {shown.map((feature) => {
                const status = statuses.get(feature.id);
                const index = indexOf(feature.id);
                // Below the marker a step is paused, not suppressed: rolling forward builds it.
                const problem =
                  rollback !== null && index >= rollback ? 'Paused' : problemOf(status);
                return (
                  <Fragment key={feature.id}>
                    {rollback === index && onRollback !== undefined && (
                      <HistoryMarker
                        onResume={() => onRollback(null)}
                        paused={features.length - index}
                      />
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
                            dropAt?.id === feature.id
                              ? dropAt.below
                                ? 'below'
                                : 'above'
                              : undefined
                          }
                          data-hidden={feature.suppressed === true ? '' : undefined}
                          data-paused={rollback !== null && index >= rollback ? '' : undefined}
                          draggable={onMove !== undefined}
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
                              if (event.key === 'ArrowUp' && index > 0)
                                onMove(feature.id, index - 1);
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
                              {isSketch(feature) ? <SketchIcon /> : <ModelingIcon />}
                            </span>
                            <span className="items-row__text">
                              <span className="items-row__name">{feature.name}</span>
                              {/* A broken step shows its error in the list (ADR 0009). */}
                              {problem !== null && (
                                <span className="items-row__problem" role="status">
                                  {problem}
                                </span>
                              )}
                            </span>
                          </button>
                          <span className="items-row__actions">
                            {isSketch(feature) && (
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
                              onClick={() =>
                                onToggleSuppressed(feature.id, feature.suppressed !== true)
                              }
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
        )}
      </div>

      <ResizeHandle
        className="items-panel__resize"
        label="Resize items panel"
        max={ITEMS_WIDTH_MAX}
        min={ITEMS_WIDTH_MIN}
        onResize={onWidthChange}
        reset={ITEMS_WIDTH_DEFAULT}
        width={width}
      />
    </aside>
  );
}
