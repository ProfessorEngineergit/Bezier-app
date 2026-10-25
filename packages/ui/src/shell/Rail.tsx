/**
 * The rails on either side of the canvas (one component, mirrored). Each rail has two sibling
 * columns, icon buttons in group bands and label pills sized to their text, so the band wraps only
 * the icons and labels can be hidden without moving them.
 *
 * Commands open in one of two ways:
 *   - A flyout (`RailItem.flyout`) adds a second icon column next to the rail, aligned with the
 *     button that opened it; other labels are dimmed.
 *   - A mode (e.g. Sketch) replaces the middle of the rail and offers an explicit exit. Modes are
 *     handled by the caller.
 */

import type { ReactNode } from 'react';
import type { Shortcut } from './shortcut.js';
import { shortcutCaps } from './shortcut.js';

export interface RailItem {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: Shortcut;
  /** Second line under the label: the current value, as in Display Modes. */
  detail?: string;
  /** Shows the corner dot that marks an item with variants. */
  opensPalette?: boolean;
  /** Second column of commands opened by this button and aligned to its row. */
  flyout?: readonly RailItem[];
  /** Hides this item's label pill, for controls that show their value in the button (units). */
  bare?: boolean;
  /** The variant in use (e.g. rectangle from centre or by diagonal); uses the hover background. */
  chosen?: boolean;
  /** Visible but disabled; the reason is shown as the tooltip. */
  disabled?: boolean;
  disabledReason?: string;
  /**
   * Panel attached to this button while it is active. Rendered inside the button wrapper, so it is
   * anchored by nesting and needs no re-measuring on scroll, resize or reflow.
   */
  popover?: ReactNode;
}

/** Related items, drawn as one band. */
export interface RailGroup {
  id: string;
  items: readonly RailItem[];
  /**
   * Vertical anchor. Matching the reference, command groups are centred, the workspace switcher is
   * pinned under the title bar and the inspection tools to the bottom.
   */
  zone?: 'top' | 'centre' | 'bottom';
  /**
   * Something this group still needs before work can continue (Simulation: supports and loads);
   * shown as a mark with this text as its accessible label.
   */
  needed?: string;
}

export interface RailProps {
  side: 'left' | 'right';
  groups: readonly RailGroup[];
  /** Item shown as current; null if none. */
  activeId: string | null;
  onActivate: (id: string) => void;
  /** Label visibility; icons never move. Flyouts always show their labels. */
  showLabels?: boolean;
  ariaLabel: string;
}

const ZONES = ['top', 'centre', 'bottom'] as const;

export function Rail({
  side,
  groups,
  activeId,
  onActivate,
  showLabels = true,
  ariaLabel,
}: RailProps) {
  return (
    <nav aria-label={ariaLabel} className={`rail rail--${side}`}>
      {ZONES.map((zone) => {
        const here = groups.filter((group) => (group.zone ?? 'top') === zone);
        if (here.length === 0) return null;

        return (
          <div className={`rail__zone rail__zone--${zone}`} key={zone}>
            {here.map((group) => (
              <Group
                activeId={activeId}
                group={group}
                key={group.id}
                onActivate={onActivate}
                showLabels={showLabels}
                side={side}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );
}

interface GroupProps {
  group: RailGroup;
  side: 'left' | 'right';
  activeId: string | null;
  onActivate: (id: string) => void;
  showLabels: boolean;
}

function Group({ group, side, activeId, onActivate, showLabels }: GroupProps) {
  return (
    <div className="rail__group" data-needed={group.needed === undefined ? undefined : ''}>
      <div className="rail__icons">
        {group.needed !== undefined && (
          <span
            className="rail__needed"
            role="status"
            aria-label={group.needed}
            title={group.needed}
          />
        )}
        {group.items.map((item) => (
          <div className="rail__slot" key={item.id}>
            <IconButton item={item} onActivate={onActivate} selected={item.id === activeId} />

            {item.id === activeId && item.popover !== undefined && (
              <div className={`rail__popoverAnchor rail__popoverAnchor--${side}`}>
                {item.popover}
              </div>
            )}

            {/* Nested in its slot so the first row lines up with the button without measuring. */}
            {item.id === activeId && item.flyout !== undefined && (
              <div className={`rail__flyout rail__flyout--${side}`}>
                <div className="rail__icons">
                  {item.flyout.map((child) => (
                    <div className="rail__slot" key={child.id}>
                      <IconButton item={child} onActivate={onActivate} selected={false} />
                    </div>
                  ))}
                </div>
                <div aria-hidden="true" className="rail__labels">
                  {item.flyout.map((child) => (
                    <Label item={child} key={child.id} side={side} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showLabels && (
        <div aria-hidden="true" className="rail__labels">
          {group.items.map((item) =>
            item.bare === true ? (
              // Keeps the label column aligned with the icons.
              <span className="rail__labelGap" key={item.id} />
            ) : (
              <Label item={item} key={item.id} side={side} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

interface IconProps {
  item: RailItem;
  selected: boolean;
  onActivate: (id: string) => void;
}

function IconButton({ item, selected, onActivate }: IconProps) {
  // Disabled commands show the reason as their tooltip.
  const title = item.disabled === true ? (item.disabledReason ?? item.label) : item.label;

  return (
    <button
      aria-current={selected}
      aria-keyshortcuts={item.shortcut}
      className="rail__icon"
      data-chosen={item.chosen === true ? '' : undefined}
      data-opens-palette={item.opensPalette === true ? '' : undefined}
      disabled={item.disabled === true}
      onClick={() => onActivate(item.id)}
      title={title}
      type="button"
    >
      <span aria-hidden="true">{item.icon}</span>
      {/* The accessible name is on the button, so hiding the decorative labels keeps it. */}
      <span className="sr-only">{item.label}</span>
    </button>
  );
}

function Label({ item, side }: { item: RailItem; side: 'left' | 'right' }) {
  const caps =
    item.shortcut === undefined ? null : (
      <span className="rail__caps">
        {shortcutCaps(item.shortcut).map((cap) => (
          <kbd key={cap}>{cap}</kbd>
        ))}
      </span>
    );

  return (
    <span
      className="rail__label"
      data-disabled={item.disabled === true ? '' : undefined}
      data-two-line={item.detail === undefined ? undefined : ''}
    >
      {/* Keycaps lead on the right rail, so the text stays next to its icon on both sides. */}
      {side === 'right' && caps}
      <span className="rail__labelText">
        <span className="rail__labelName">{item.label}</span>
        {item.detail !== undefined && <span className="rail__detail">{item.detail}</span>}
      </span>
      {side === 'left' && caps}
    </span>
  );
}
