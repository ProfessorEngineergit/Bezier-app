/**
 * The bodies in the document, as rows in the Items panel above the history (ADR 0012). Bodies can
 * be hidden, removed, picked, filed in folders, and isolated with Alt-click on the eye.
 *
 * Uses its own row class, not `items-row`, so tests and styles for history rows never match bodies.
 */

/// <reference lib="dom" />

import type { BodySummary } from '@bezier/core';
import { DeleteIcon, EyeIcon, EyeOffIcon, FolderIcon, ModelingIcon } from '@bezier/ui';
import { useRef, useState } from 'react';
import './body-list.css';
import { useRowWindow } from './use-row-window.js';

export interface BodyListProps {
  bodies: readonly BodySummary[];
  /** Keys of the bodies the current selection touches. */
  selected: ReadonlySet<string>;
  /** `additive` when a modifier was held, to pick several bodies for Combine. */
  onSelect: (key: string, additive: boolean) => void;
  onToggleVisible: (key: string, visible: boolean) => void;
  onRemove: (key: string) => void;
  /** A new name, or an empty one to go back to "Body n". */
  onRename: (key: string, name: string) => void;
  /** Folder name by body key. */
  folders?: Readonly<Record<string, string>>;
  /** File a body under a folder; an empty name takes it out. */
  onFolder?: (key: string, folder: string) => void;
  /** Hide every other body, or show them all again. */
  onIsolate?: (key: string) => void;
  onFolderVisible?: (folder: string, visible: boolean) => void;
}

export function BodyList({
  bodies,
  selected,
  onSelect,
  onToggleVisible,
  onRemove,
  onRename,
  folders = {},
  onFolder,
  onIsolate,
  onFolderVisible,
}: BodyListProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [filing, setFiling] = useState<string | null>(null);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const names = [...new Set(Object.values(folders))].sort((a, b) => a.localeCompare(b));
  const loose = bodies.filter((body) => folders[body.key] === undefined);
  const looseList = useRef<HTMLUListElement | null>(null);
  const shown = useRowWindow(loose.length, looseList);

  const row = (body: BodySummary) =>
    renaming === body.key ? (
      <li key={body.key}>
        <input
          aria-label={`Rename ${body.label}`}
          className="body-row body-row--input"
          defaultValue={body.label}
          onBlur={(event) => {
            const next = event.target.value.trim();
            setRenaming(null);
            if (next !== body.label) onRename(body.key, next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            // Restore the old name before blurring, or the commit on blur saves the abandoned edit.
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
    ) : filing === body.key ? (
      <li key={body.key}>
        <input
          aria-label={`Folder for ${body.label}`}
          className="body-row body-row--input"
          defaultValue={folders[body.key] ?? ''}
          list="body-folders"
          onBlur={(event) => {
            const next = event.target.value.trim();
            setFiling(null);
            if (next !== (folders[body.key] ?? '')) onFolder?.(body.key, next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              event.currentTarget.value = folders[body.key] ?? '';
              event.currentTarget.blur();
            }
          }}
          placeholder="Folder name, empty for none"
          // biome-ignore lint/a11y/noAutofocus: the field only exists once asked for
          autoFocus
          type="text"
        />
      </li>
    ) : (
      <li key={body.key}>
        <div className="items-entry" data-hidden={body.hidden ? '' : undefined}>
          <button
            aria-current={selected.has(body.key)}
            className="body-row"
            // A hidden body has nothing to select; the eye beside it shows it again.
            disabled={body.hidden}
            onClick={(event) =>
              onSelect(body.key, event.shiftKey || event.metaKey || event.ctrlKey)
            }
            // Rename in place, like the history rows.
            onDoubleClick={() => setRenaming(body.key)}
            title={body.hidden ? 'Hidden' : 'Select'}
            type="button"
          >
            <span aria-hidden="true" className="items-row__icon">
              <ModelingIcon />
            </span>
            <span className="items-row__text">
              <span className="items-row__name">{body.label}</span>
            </span>
          </button>
          <span className="items-row__actions">
            <button
              aria-label={`${body.hidden ? 'Show' : 'Hide'} ${body.label}`}
              onClick={(event) => {
                if (event.altKey && onIsolate !== undefined) onIsolate(body.key);
                else onToggleVisible(body.key, body.hidden);
              }}
              title={`${body.hidden ? 'Show' : 'Hide'} (Alt-click: show only this)`}
              type="button"
            >
              {body.hidden ? <EyeOffIcon /> : <EyeIcon />}
            </button>
            <button
              aria-label={`Remove ${body.label}`}
              onClick={() => onRemove(body.key)}
              title="Remove"
              type="button"
            >
              <DeleteIcon />
            </button>
          </span>
        </div>
      </li>
    );

  return (
    <>
      <datalist id="body-folders">
        {names.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <ul aria-label="Bodies" className="items-list" ref={looseList}>
        {shown.before > 0 && (
          <li aria-hidden="true" data-spacer="" style={{ height: shown.before }} />
        )}
        {loose.slice(shown.start, shown.end).map(row)}
        {shown.after > 0 && (
          <li aria-hidden="true" data-spacer="" style={{ height: shown.after }} />
        )}
      </ul>
      {names.map((name) => {
        const inside = bodies.filter((body) => folders[body.key] === name);
        const open = !folded.has(name);
        const allHidden = inside.length > 0 && inside.every((body) => body.hidden);
        return (
          <section aria-label={`Folder ${name}`} className="body-folder" key={name}>
            <div className="items-entry">
              <button
                aria-expanded={open}
                className="body-row body-folder__head"
                onClick={() =>
                  setFolded((current) => {
                    const next = new Set(current);
                    if (open) next.add(name);
                    else next.delete(name);
                    return next;
                  })
                }
                type="button"
              >
                <span aria-hidden="true" className="items-row__icon">
                  <FolderIcon />
                </span>
                <span className="items-row__text">
                  <span className="items-row__name">{name}</span>
                </span>
                <span className="body-folder__count">{inside.length}</span>
              </button>
              {onFolderVisible !== undefined && (
                <span className="items-row__actions">
                  <button
                    aria-label={`${allHidden ? 'Show' : 'Hide'} folder ${name}`}
                    onClick={() => onFolderVisible(name, allHidden)}
                    title={allHidden ? 'Show all' : 'Hide all'}
                    type="button"
                  >
                    {allHidden ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </span>
              )}
            </div>
            {open && <ul className="items-list body-folder__list">{inside.map(row)}</ul>}
          </section>
        );
      })}
    </>
  );
}
