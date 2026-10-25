import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon.js';

interface Item {
  label: string;
  icon?: IconName;
  danger?: boolean;
  /** Draw a hairline above this item. */
  separated?: boolean;
  onSelect: () => void;
}

interface Props {
  label: string;
  items: Item[];
  /** The trigger content; defaults to the ⋯ icon. */
  trigger?: ReactNode;
  className?: string;
}

/** A small popover menu that closes on a choice, a click elsewhere, or Escape. */
export function Menu({ label, items, trigger, className }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !anchor.current?.contains(event.target))
        setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', onEscape, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', onEscape, true);
    };
  }, [open]);

  return (
    <div className="lessons-menu-anchor" ref={anchor}>
      <button
        aria-controls={id}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={className ?? 'lessons-button lessons-button--quiet lessons-button--icon'}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {trigger ?? <Icon name="more" />}
      </button>
      {open && (
        <div className="lessons-menu lessons-glass" id={id} role="menu">
          {items.map((item) => (
            <div key={item.label}>
              {item.separated && <hr />}
              <button
                data-danger={item.danger ? '' : undefined}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                role="menuitem"
                type="button"
              >
                {item.icon && <Icon name={item.icon} />}
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
