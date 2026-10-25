/**
 * A transient panel attached to a rail button. Anchored by nesting (a child of the button's
 * wrapper, positioned in CSS) rather than by measuring, so it needs no re-measuring on scroll,
 * resize or reflow.
 */

import { type ReactNode, useEffect, useRef } from 'react';

export interface PopoverProps {
  /** Header title naming what the controls belong to. */
  title: string;
  /** Replaces the visible title, which then only labels the panel for assistive technology. */
  header?: ReactNode;
  side: 'left' | 'right';
  onClose: () => void;
  children: ReactNode;
}

export function Popover({ title, header, side, onClose, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Escape or a click elsewhere closes it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onDown = (event: PointerEvent) => {
      const panel = ref.current;
      if (panel === null) return;
      const target = event.target;
      if (target instanceof Node && !panel.contains(target)) {
        // Ignore clicks on the rail: the opening button would otherwise close and reopen it.
        if (target instanceof Element && target.closest('.rail__icon') !== null) return;
        onClose();
      }
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  return (
    // A section, not a dialog: no focus trap, so the viewport stays usable.
    <section aria-label={title} className={`popover popover--${side}`} ref={ref}>
      {header ?? <p className="popover__title">{title}</p>}
      {children}
    </section>
  );
}

/** A labelled row inside a popover. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    // The label wraps the control, so no `for`/`id` pair is needed. The lint rule cannot see the
    // control through `ReactNode`.
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

/** A radio group of mutually exclusive choices. */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="choice">
      <legend className="field__label">{label}</legend>
      {options.map((option) => (
        <label className="choice__option" key={option.value}>
          <input
            checked={option.value === value}
            name={label}
            onChange={() => onChange(option.value)}
            type="radio"
            value={option.value}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * A few mutually exclusive choices as one row of segments, optionally with a picture above each
 * label (mouse, trackpad). Backed by radio inputs for keyboard and screen reader support.
 */
export function SegmentedChoice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string; icon?: ReactNode; detail?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="icon-choice">
      <legend className="field__label">{label}</legend>
      <div className="icon-choice__row">
        {options.map((option) => (
          <label
            className="icon-choice__option"
            data-checked={option.value === value ? '' : undefined}
            key={option.value}
          >
            <input
              checked={option.value === value}
              name={label}
              onChange={() => onChange(option.value)}
              type="radio"
              value={option.value}
            />
            {option.icon}
            <span>{option.label}</span>
            {option.detail !== undefined && <small>{option.detail}</small>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** An on/off control. */
export function Toggle({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="toggle" title={hint}>
      <input
        checked={checked}
        disabled={disabled === true}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{label}</span>
      {hint !== undefined && <span className="toggle__hint">{hint}</span>}
    </label>
  );
}
