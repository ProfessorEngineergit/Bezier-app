import { FolderIcon, MoreIcon } from '@bezier/ui';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ResizeHandle } from './ResizeHandle.js';

interface FolderRowProps {
  name: string;
  count: number;
  active: boolean;
  /** The id a dragged card finds under the pointer (`card-drag.ts`). */
  dropId: string;
  /** A card is held over this folder and the tray below it is open. */
  dropOpen: boolean;
  /** Shown below the row while a card is held over it (`FolderDropTray`). */
  tray: ReactNode;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

export function FolderRow({
  name,
  count,
  active,
  dropId,
  dropOpen,
  tray,
  onOpen,
  onRename,
  onDelete,
}: FolderRowProps) {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const row = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const more = useRef<HTMLButtonElement | null>(null);
  const focusFirstMenuItem = useRef(false);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (menuAt === null) return;
    if (focusFirstMenuItem.current) {
      menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    } else {
      menu.current?.focus({ preventScroll: true });
    }
    const dismiss = (event: PointerEvent) => {
      if (!row.current?.contains(event.target as Node)) setMenuAt(null);
    };
    const dismissWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuAt(null);
      more.current?.focus();
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', dismissWithKeyboard);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', dismissWithKeyboard);
    };
  }, [menuAt]);

  const commit = (value: string) => {
    setEditing(false);
    const next = value.trim();
    if (next !== '' && next !== name) onRename(next);
  };

  const openMenu = (x: number, y: number) => {
    const width = 152;
    const height = 76;
    const edge = 8;
    const rowBounds = row.current?.getBoundingClientRect();
    const minimumX = Math.max(edge, rowBounds?.left ?? edge);
    const maximumX = Math.min(
      window.innerWidth - width - edge,
      (rowBounds?.right ?? window.innerWidth) - width,
    );
    setMenuAt({
      x: Math.max(minimumX, Math.min(maximumX, x)),
      y: Math.min(window.innerHeight - height - edge, Math.max(edge, y)),
    });
  };

  const openContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (editing) return;
    focusFirstMenuItem.current = false;
    const bounds = event.currentTarget.getBoundingClientRect();
    openMenu(event.clientX, bounds.bottom + 4);
  };

  return (
    // The row and the drop space it opens below are one target, so moving into that space does not
    // leave the folder.
    <div
      className="library-folder-slot"
      data-drop-folder={dropId}
      data-drop-open={dropOpen ? '' : undefined}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: right-click supplements the row's existing open and menu buttons */}
      <div
        className="library-folder"
        data-active={active ? '' : undefined}
        data-drop-target={dropOpen ? '' : undefined}
        onContextMenu={openContextMenu}
        ref={row}
      >
        {editing ? (
          <input
            aria-label="Folder name"
            defaultValue={name}
            onBlur={(event) => commit(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit(event.currentTarget.value);
              if (event.key === 'Escape') setEditing(false);
            }}
            ref={input}
          />
        ) : (
          <button
            className="library-folder__open"
            // Clicking the current folder's row edits its name, as clicking a project's name does.
            onClick={() => (active ? setEditing(true) : onOpen())}
            title={active ? 'Rename' : undefined}
            type="button"
          >
            <FolderIcon open={dropOpen} />
            <span>{name}</span>
          </button>
        )}
        <span className="library-folder__trailing">
          {/* Empty folders show no count; the empty folder page says so when opened. */}
          {count > 0 && <small>{count}</small>}
          <button
            aria-label={`More options for ${name}`}
            className="library-folder__more"
            onClick={(event) => {
              if (menuAt !== null) {
                setMenuAt(null);
                return;
              }
              const bounds = event.currentTarget.getBoundingClientRect();
              focusFirstMenuItem.current = event.detail === 0;
              openMenu(bounds.right - 152, bounds.bottom + 4);
            }}
            ref={more}
            type="button"
          >
            <MoreIcon />
          </button>
        </span>
        {menuAt !== null && (
          <div
            aria-label={`Folder actions for ${name}`}
            className="menu library-folder__menu"
            onKeyDown={navigateMenu}
            ref={menu}
            role="menu"
            style={{ left: menuAt.x, top: menuAt.y }}
            tabIndex={-1}
          >
            <button
              className="menu__item"
              onClick={() => {
                setMenuAt(null);
                setEditing(true);
              }}
              role="menuitem"
              type="button"
            >
              Rename…
            </button>
            <button
              className="menu__item"
              data-destructive=""
              onClick={() => {
                setMenuAt(null);
                onDelete();
              }}
              role="menuitem"
              type="button"
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {tray}
    </div>
  );
}

/** The library sidebar's resize handle; shared behaviour is in `ResizeHandle`. */
export function SidebarResizeHandle({
  width,
  onResize,
}: {
  width: number;
  onResize: (width: number) => void;
}) {
  return (
    <ResizeHandle
      className="library-sidebar__resize"
      label="Resize sidebar"
      max={360}
      min={192}
      onResize={onResize}
      reset={232}
      width={width}
    />
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
          : (current - 1 + items.length) % items.length;
  items[next]?.focus();
}
