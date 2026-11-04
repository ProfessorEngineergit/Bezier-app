/**
 * The Items panel, floating at the left edge (the rail steps aside via `data-left-panel` in the
 * app stylesheet). Lists the document's bodies (ADR 0012, rows in `BodyList`) above the features
 * that built them. The filter narrows to sketches or bodies; an empty document shows a message
 * instead of a bare list.
 */

/// <reference lib="dom" />

import type { BodySummary, FeatureId, FeatureRecord, FeatureStatus } from '@bezier/core';
import { useEffect, useRef, useState } from 'react';
import { BodyList } from './BodyList.js';
import { HistorySteps } from './HistorySteps.js';
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
            <HistorySteps
              features={features}
              onDelete={onDelete}
              onEditSketch={onEditSketch}
              onRename={onRename}
              onSelect={onSelect}
              onToggleSuppressed={onToggleSuppressed}
              {...(onMove !== undefined ? { onMove } : {})}
              {...(onRollback !== undefined ? { onRollback } : {})}
              rollback={rollback}
              selectedId={selectedId}
              shown={shown}
              statuses={statuses}
            />
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
