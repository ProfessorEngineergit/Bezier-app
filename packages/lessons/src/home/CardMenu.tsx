/**
 * A lesson card's menu, opened by its ⋯ button or a right-click on the card. Uses the start page's
 * own classes (`menu`, `tile__menu`, `menu__item`) so it matches the project card menus.
 */

import { type KeyboardEvent as ReactKeyboardEvent, type RefObject, useEffect, useRef } from 'react';

export interface CardMenuItem {
  label: string;
  destructive?: boolean;
  onSelect: () => void;
}

export interface MenuPoint {
  x: number;
  y: number;
  /** Opened from the keyboard; only then does the first entry get the focus ring. */
  keyboard: boolean;
}

/** Clamps the menu position so the whole menu fits in the window. */
export function menuPoint(x: number, y: number, keyboard = false): MenuPoint {
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - 196)),
    y: Math.max(8, Math.min(y, window.innerHeight - 236)),
    keyboard,
  };
}

export function CardMenu({
  at,
  label,
  items,
  within,
  onClose,
}: {
  at: MenuPoint;
  label: string;
  items: readonly CardMenuItem[];
  /** The card element; presses inside it do not dismiss the menu. */
  within: RefObject<HTMLElement | null>;
  onClose: (byKey: boolean) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (at.keyboard) menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    else menu.current?.focus();
    const dismiss = (event: Event) => {
      if (within.current?.contains(event.target as Node) === true) return;
      close.current(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current(true);
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [at, within]);

  return (
    <div
      aria-label={label}
      className="menu tile__menu"
      onKeyDown={navigate}
      ref={menu}
      role="menu"
      style={{ left: at.x, top: at.y }}
      tabIndex={-1}
    >
      {items.map((item) => (
        <button
          className="menu__item"
          data-destructive={item.destructive === true ? '' : undefined}
          key={item.label}
          onClick={() => {
            onClose(false);
            item.onSelect();
          }}
          role="menuitem"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function navigate(event: ReactKeyboardEvent<HTMLDivElement>): void {
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
