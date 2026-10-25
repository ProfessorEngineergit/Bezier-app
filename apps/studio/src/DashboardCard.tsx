/**
 * One project on the start page. The picture opens it, the name renames it in place (Return
 * commits, Escape cancels), and the ⋯ button or a right-click offers the rest.
 *
 * The menu comes from `project-menu.ts`, where its order and destructive marking are tested.
 */

import { MoreIcon, PartIcon } from '@bezier/ui';
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react';
import type { DocumentInfo } from './boot.js';
import { type CardDragHandlers, watchCardDrag } from './card-drag.js';
import { useCollab } from './collab/CollabProvider.js';
import { isSharedId } from './collab/shared-projects.js';
import { LearnProjectWatermark } from './LearnProjectWatermark.js';
import { isLessonProject } from './lesson-project.js';
import type { ProjectAction } from './project-menu.js';
import { projectMenu } from './project-menu.js';

export interface DashboardCardProps {
  doc: DocumentInfo;
  location?: string;
  /** The last look at this project, as an object URL. */
  thumbnail?: string;
  dragging: boolean;
  /** Being deleted: the card lifts and dissolves before it is taken out of the list. */
  leaving?: boolean;
  /** Part of the start page's selection (use-card-selection.ts). */
  selected: boolean;
  /** Command- or Shift-click: into the selection or out of it. */
  onToggleSelected: () => void;
  onOpen: () => void;
  onRename: (name: string) => void;
  onAction: (action: ProjectAction, origin?: { x: number; y: number }) => void;
  drag: CardDragHandlers;
}

export function DashboardCard({
  doc,
  location,
  thumbnail,
  dragging,
  leaving = false,
  selected,
  onToggleSelected,
  onOpen,
  onRename,
  onAction,
  drag,
}: DashboardCardProps) {
  const collab = useCollab();
  const shared = isSharedId(doc.id);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  /** What is in the name field, so the field can be as wide as its text. */
  const [draft, setDraft] = useState(doc.name);
  /** Whether the menu was opened from the keyboard: only then does its first entry take the ring. */
  const keyboardMenu = useRef(false);
  const card = useRef<HTMLDivElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const more = useRef<HTMLButtonElement | null>(null);
  const field = useRef<HTMLInputElement | null>(null);
  /**
   * Set once an edit is settled by Return or Escape. The field can report a blur while unmounting;
   * without this, Escape would be followed by that blur committing the discarded edit.
   */
  const settled = useRef(false);
  /** Gives up a drag in progress when the card goes away under it. */
  const abandonDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => abandonDrag.current?.(), []);

  useEffect(() => {
    if (!editing) return;
    settled.current = false;
    setDraft(doc.name);
    field.current?.focus();
    field.current?.select();
  }, [editing, doc.name]);

  useEffect(() => {
    if (menuAt === null) return;
    // Opened with the pointer, the menu itself takes focus: arrow keys work, and no entry is
    // ringed before one is chosen.
    if (keyboardMenu.current) menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    else menu.current?.focus();
    const dismiss = (event: Event) => {
      if (card.current?.contains(event.target as Node) === true) return;
      setMenuAt(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuAt(null);
      more.current?.focus();
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuAt]);

  const commit = (value: string) => {
    if (settled.current) return;
    settled.current = true;
    setEditing(false);
    const next = value.trim();
    if (next !== '' && next !== doc.name) onRename(next);
  };

  const cancel = () => {
    settled.current = true;
    setEditing(false);
  };

  const when = location !== undefined ? projectPath(location) : formatWhen(doc.modifiedAt);

  return (
    // Right-click anywhere opens the menu. No click handler: the picture and name are the pointer
    // routes, the corner button is the keyboard route, and the context menu is an extra.
    // biome-ignore lint/a11y/noStaticElementInteractions: contextmenu on a container whose own controls are already focusable
    <div
      className="tile"
      data-doc-id={doc.id}
      data-lesson={isLessonProject(doc.id) ? '' : undefined}
      data-shared={shared ? '' : undefined}
      data-dragging={dragging ? '' : undefined}
      data-leaving={leaving ? '' : undefined}
      data-selected={selected ? '' : undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        if (editing) return;
        keyboardMenu.current = false;
        setMenuAt(menuPoint(event.clientX, event.clientY));
      }}
      // Not while renaming (a text-selection drag would pick up the card) and not from the card's
      // own controls. Touch keeps scrolling the page.
      onPointerDown={(event) => {
        if (editing || event.button !== 0 || event.pointerType === 'touch') return;
        if ((event.target as HTMLElement).closest('.tile__more, .tile__menu, input') !== null) {
          return;
        }
        const tile = card.current;
        if (tile === null) return;
        setMenuAt(null);
        abandonDrag.current?.();
        abandonDrag.current = watchCardDrag(event.nativeEvent, tile, drag);
      }}
      ref={card}
    >
      <button
        aria-label={`Open ${doc.name}`}
        className={thumbnail === undefined ? 'tile__face' : 'tile__face tile__face--shot'}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey) onToggleSelected();
          else onOpen();
        }}
        type="button"
      >
        {thumbnail === undefined ? (
          <span aria-hidden="true" className="tile__thumb">
            <PartIcon />
          </span>
        ) : (
          // Empty alt: the button beside it already names the project.
          <img alt="" className="tile__shot" draggable={false} src={thumbnail} />
        )}
        {isLessonProject(doc.id) && thumbnail === undefined && <LearnProjectWatermark />}
      </button>

      <div className="tile__foot">
        <span className="tile__text">
          {editing ? (
            // As wide as the typed name, never wider than the card: a hidden copy of the text
            // sizes the cell the field fills (as the title bar's name does).
            <span className="tile__nameField" data-value={`${draft} `}>
              <input
                aria-label="Project name"
                className="tile__nameInput"
                defaultValue={doc.name}
                onChange={(event) => setDraft(event.currentTarget.value)}
                size={1}
                onBlur={(event) => commit(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commit(event.currentTarget.value);
                  } else if (event.key === 'Escape') {
                    // The edit's own Escape must not also close the start page.
                    event.stopPropagation();
                    cancel();
                  }
                }}
                ref={field}
                spellCheck={false}
                type="text"
              />
            </span>
          ) : (
            <button
              className="tile__name"
              onClick={() => setEditing(true)}
              title="Rename"
              type="button"
            >
              {doc.name}
            </button>
          )}
          {(when !== '' || shared) && (
            <span className="tile__when" title={fullDate(doc.modifiedAt)}>
              {shared ? (when === '' ? 'Shared' : `Shared · ${when}`) : when}
            </span>
          )}
        </span>
        <button
          aria-expanded={menuAt !== null}
          aria-haspopup="menu"
          aria-label="More options"
          className="tile__more"
          onClick={(event) => {
            const here = event.currentTarget.getBoundingClientRect();
            // A click that came from Return or Space has no pointer position.
            keyboardMenu.current = event.detail === 0;
            setMenuAt(menuAt === null ? menuPoint(here.right - 184, here.bottom + 4) : null);
          }}
          ref={more}
          type="button"
        >
          <MoreIcon />
        </button>
      </div>

      {menuAt !== null && (
        <div
          aria-label={`Actions for ${doc.name}`}
          className="menu tile__menu"
          onKeyDown={navigateMenu}
          ref={menu}
          role="menu"
          style={{ left: menuAt.x, top: menuAt.y }}
          tabIndex={-1}
        >
          {projectMenu(isLessonProject(doc.id), collab.connected && !shared).map((item) => (
            <button
              className="menu__item"
              data-destructive={item.destructive === true ? '' : undefined}
              key={item.action}
              onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                setMenuAt(null);
                if (item.action === 'open') onOpen();
                else if (item.action === 'rename') setEditing(true);
                else
                  onAction(item.action, {
                    x: bounds.x + bounds.width / 2,
                    y: bounds.y + bounds.height / 2,
                  });
              }}
              role="menuitem"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function navigateMenu(event: ReactKeyboardEvent<HTMLDivElement>): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? (current + 1) % items.length
          : current < 0
            ? items.length - 1
            : (current - 1 + items.length) % items.length;
  items[next]?.focus();
}

function projectPath(location: string): string {
  return location === 'Projects' ? location : `Projects / ${location}`;
}

function menuPoint(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - 196)),
    y: Math.max(8, Math.min(y, window.innerHeight - 236)),
  };
}

/** A short last-modified label: time for today, day and month this year, else with the year. */
function formatWhen(iso: string): string {
  const date = parse(iso);
  if (date === null) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `Today, ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString(
    undefined,
    date.getFullYear() === now.getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' },
  );
}

function fullDate(iso: string): string | undefined {
  const date = parse(iso);
  return date === null
    ? undefined
    : date.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
}

function parse(iso: string): Date | null {
  if (iso === '') return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
