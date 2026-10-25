/**
 * The Items panel's list as a tree. Folders fold; an imported STEP file is a folder named after the
 * file holding its bodies, and user folders hold theirs. Rows have no buttons: click selects,
 * double-click renames (bodies) or reopens (sketches). The eye shows on the selected and hovered
 * rows and stays on hidden ones; Alt-click on a body's eye isolates it.
 *
 * A sketch that has been built from is no longer drawn, and its row is dimmed with the struck eye
 * like a hidden body; its eye selects it, since a selected sketch is always drawn.
 *
 * The step history is a developer setting (`showHistory`) listed in `ItemsPanel.tsx`.
 */

/// <reference lib="dom" />

import type { BodySummary, FeatureId, FeatureRecord } from '@bezier/core';
import { EyeIcon, EyeOffIcon, FolderIcon, MeshIcon } from '@bezier/ui';
import { type MouseEvent as ReactMouseEvent, type ReactNode, useState } from 'react';
import { BodyItemIcon, PictureItemIcon, SketchItemIcon } from './ItemIcons.js';
import type { ItemsFilter } from './ItemsPanel.js';
import { sketchBodyLabels } from './item-relations.js';
import './items-tree.css';

export interface ItemsTreeProps {
  filter: ItemsFilter;
  features: readonly FeatureRecord[];
  bodies: readonly BodySummary[];
  selectedBodies: ReadonlySet<string>;
  selectedId: FeatureId | null;
  folders: Readonly<Record<string, string>>;
  onSelectBody: (key: string, additive: boolean) => void;
  /** Picks several bodies at once (a folder's). */
  onSelectBodies: (keys: readonly string[], additive: boolean) => void;
  /** Shows or hides several bodies as one step. */
  onBodiesVisible: (keys: readonly string[], visible: boolean) => void;
  onIsolateBody?: (key: string) => void;
  onRenameBody: (key: string, name: string) => void;
  onSelect: (id: FeatureId) => void;
  onEditSketch: (id: FeatureId) => void;
  onToggleSuppressed: (id: FeatureId, suppressed: boolean) => void;
  /** The sketches currently drawn in the model. When omitted, every unsuppressed sketch is. */
  shownSketches?: ReadonlySet<string>;
}

interface Folder {
  id: string;
  name: string;
  bodies: BodySummary[];
}

/** The folder a body belongs in: the user's, else the file it was imported from. */
function foldersOf(
  bodies: readonly BodySummary[],
  features: readonly FeatureRecord[],
  userFolders: Readonly<Record<string, string>>,
): { folders: Folder[]; loose: BodySummary[] } {
  const byId = new Map<string, Folder>();
  const loose: BodySummary[] = [];
  for (const body of bodies) {
    const own = userFolders[body.key];
    const source = features.find((feature) => feature.id === body.key.split('#')[0]);
    const imported = source?.type === 'import-step' ? source : undefined;
    const id = own !== undefined ? `folder:${own}` : imported ? `import:${imported.id}` : null;
    if (id === null) {
      loose.push(body);
      continue;
    }
    const name = own ?? (imported?.name.replace(/^Import /, '') || 'Import');
    const folder = byId.get(id) ?? { id, name, bodies: [] };
    folder.bodies.push(body);
    byId.set(id, folder);
  }
  const folders = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { folders, loose };
}

function Eye({
  hidden,
  label,
  onClick,
}: {
  hidden: boolean;
  label: string;
  onClick: (event: ReactMouseEvent) => void;
}) {
  // No tooltip: the icon is self-explanatory, and Alt-click is in the shortcuts list.
  return (
    <button
      aria-label={`${hidden ? 'Show' : 'Hide'} ${label}`}
      className="tree-row__eye"
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      type="button"
    >
      {hidden ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  );
}

function Row({
  depth,
  icon,
  label,
  description,
  current,
  hidden,
  expanded,
  onToggle,
  onClick,
  onDoubleClick,
  eye,
  kind,
}: {
  depth: number;
  icon: ReactNode;
  label: ReactNode;
  description?: string;
  current: boolean;
  hidden: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onClick: (event: ReactMouseEvent) => void;
  onDoubleClick?: () => void;
  eye: ReactNode;
  kind: 'folder' | 'body' | 'mesh' | 'image' | 'sketch';
}) {
  return (
    <li
      aria-current={current}
      className="tree-row"
      data-hidden={hidden ? '' : undefined}
      data-kind={kind}
      style={{ paddingLeft: `${4 + depth * 16}px` }}
    >
      {onToggle !== undefined ? (
        <button
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Close' : 'Open'} ${typeof label === 'string' ? label : 'folder'}`}
          className="tree-row__chevron"
          data-open={expanded ? '' : undefined}
          onClick={onToggle}
          type="button"
        >
          <svg aria-hidden="true" height="10" viewBox="0 0 10 10" width="10">
            <path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      ) : (
        <span aria-hidden="true" className="tree-row__chevron" />
      )}
      <button
        className="tree-row__main"
        onClick={onClick}
        {...(onDoubleClick !== undefined ? { onDoubleClick } : {})}
        type="button"
      >
        <span aria-hidden="true" className="tree-row__icon">
          {icon}
        </span>
        <span className="tree-row__name">{label}</span>
        {description && (
          <small aria-hidden="true" className="tree-row__description">
            {description}
          </small>
        )}
      </button>
      {eye}
    </li>
  );
}

export function ItemsTree({
  filter,
  features,
  bodies,
  selectedBodies,
  selectedId,
  folders: userFolders,
  onSelectBody,
  onSelectBodies,
  onBodiesVisible,
  onIsolateBody,
  onRenameBody,
  onSelect,
  onEditSketch,
  onToggleSuppressed,
  shownSketches,
}: ItemsTreeProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const showBodies = filter !== 'sketches';
  const showSketches = filter !== 'bodies';
  const { folders, loose } = foldersOf(bodies, features, userFolders);
  const meshes = features.filter((feature) => feature.type === 'reference-mesh');
  const pictures = features.filter((feature) => feature.type === 'reference-image');
  const sketches = features.filter((feature) => feature.type === 'sketch');
  const additive = (event: ReactMouseEvent) => event.shiftKey || event.metaKey || event.ctrlKey;

  const bodyRow = (body: BodySummary, depth: number) =>
    renaming === body.key ? (
      <li className="tree-row" key={body.key} style={{ paddingLeft: `${4 + depth * 16}px` }}>
        <span aria-hidden="true" className="tree-row__chevron" />
        <input
          aria-label={`Rename ${body.label}`}
          className="tree-row__input"
          defaultValue={body.label}
          onBlur={(event) => {
            const next = event.target.value.trim();
            setRenaming(null);
            if (next !== body.label) onRenameBody(body.key, next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              event.currentTarget.value = body.label;
              event.currentTarget.blur();
            }
          }}
          // biome-ignore lint/a11y/noAutofocus: the field only exists once asked for
          autoFocus
          type="text"
        />
      </li>
    ) : (
      <Row
        current={selectedBodies.has(body.key)}
        depth={depth}
        eye={
          <Eye
            hidden={body.hidden}
            label={body.label}
            onClick={(event) => {
              if (event.altKey && onIsolateBody !== undefined) onIsolateBody(body.key);
              else onBodiesVisible([body.key], body.hidden);
            }}
          />
        }
        hidden={body.hidden}
        icon={<BodyItemIcon />}
        key={body.key}
        kind="body"
        label={body.label}
        onClick={(event) => {
          if (!body.hidden) onSelectBody(body.key, additive(event));
        }}
        onDoubleClick={() => setRenaming(body.key)}
      />
    );

  const featureRow = (feature: FeatureRecord, kind: 'mesh' | 'image' | 'sketch') => {
    const suppressed = feature.suppressed === true;
    // Built from, so no longer drawn: shown as hidden, though nothing switched it off.
    const builtFrom =
      kind === 'sketch' &&
      !suppressed &&
      shownSketches !== undefined &&
      !shownSketches.has(feature.id);
    const into = kind === 'sketch' ? sketchBodyLabels(feature.id, features, bodies) : [];
    return (
      <Row
        current={feature.id === selectedId}
        depth={0}
        eye={
          <Eye
            hidden={suppressed || builtFrom}
            label={feature.name}
            onClick={() =>
              builtFrom ? onSelect(feature.id) : onToggleSuppressed(feature.id, !suppressed)
            }
          />
        }
        hidden={suppressed || builtFrom}
        icon={
          kind === 'mesh' ? (
            <MeshIcon />
          ) : kind === 'image' ? (
            <PictureItemIcon />
          ) : (
            <SketchItemIcon />
          )
        }
        {...(into.length > 0 ? { description: into.join(', ') } : {})}
        key={feature.id}
        kind={kind}
        label={feature.name}
        onClick={() => onSelect(feature.id)}
        {...(kind === 'sketch' ? { onDoubleClick: () => onEditSketch(feature.id) } : {})}
      />
    );
  };

  /** A heading over each kind, when the list holds more than one. */
  const heading = (text: string) => (
    <li aria-hidden="true" className="tree__heading" key={`heading-${text}`}>
      {text}
    </li>
  );

  const rows: ReactNode[] = [];
  if (showBodies) {
    for (const folder of folders) {
      // A folder containing the selection opens automatically, so a body picked in the model is
      // never hidden in a closed folder.
      const holdsSelection = folder.bodies.some((body) => selectedBodies.has(body.key));
      const expanded = open.has(folder.id) || holdsSelection;
      const allHidden = folder.bodies.every((body) => body.hidden);
      rows.push(
        <Row
          current={false}
          depth={0}
          expanded={expanded}
          eye={
            <Eye
              hidden={allHidden}
              label={`folder ${folder.name}`}
              onClick={() =>
                onBodiesVisible(
                  folder.bodies.map((body) => body.key),
                  allHidden,
                )
              }
            />
          }
          hidden={allHidden}
          icon={<FolderIcon />}
          key={folder.id}
          kind="folder"
          label={folder.name}
          onClick={(event) => {
            // Selects all the folder's visible bodies.
            const keys = folder.bodies.filter((body) => !body.hidden).map((body) => body.key);
            if (keys.length > 0) onSelectBodies(keys, additive(event));
          }}
          onToggle={() =>
            setOpen((current) => {
              const next = new Set(current);
              if (next.has(folder.id)) next.delete(folder.id);
              else next.add(folder.id);
              return next;
            })
          }
        />,
      );
      if (expanded) for (const body of folder.bodies) rows.push(bodyRow(body, 1));
    }
    for (const body of loose) rows.push(bodyRow(body, 0));
    for (const mesh of meshes) rows.push(featureRow(mesh, 'mesh'));
    for (const picture of pictures) rows.push(featureRow(picture, 'image'));
  }
  if (showSketches && sketches.length > 0) {
    const mixed = rows.length > 0;
    if (mixed) rows.unshift(heading('Bodies'));
    if (mixed) rows.push(heading('Sketches'));
    for (const sketch of sketches) rows.push(featureRow(sketch, 'sketch'));
  }

  if (rows.length === 0) {
    return (
      <div className="items-panel__empty">
        <p className="items-panel__emptyTitle">
          {filter === 'sketches'
            ? 'No sketches yet'
            : filter === 'bodies'
              ? 'No bodies yet'
              : 'Workspace is empty'}
        </p>
        <p className="items-panel__emptyNote">
          {filter === 'sketches'
            ? 'Draw one to see it here'
            : filter === 'bodies'
              ? 'Extrude or revolve a sketch to see it here'
              : 'Start modeling to view your items here'}
        </p>
      </div>
    );
  }
  return (
    <ul aria-label="Items" className="tree">
      {rows}
    </ul>
  );
}
