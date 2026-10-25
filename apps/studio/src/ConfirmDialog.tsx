import { useEffect, useRef } from 'react';
import { useModalIsolation } from './use-modal-isolation.js';

interface ConfirmDialogProps {
  title: string;
  detail: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  /**
   * Focused again once the dialog closes. The caller must capture it synchronously before the
   * opener (a menu item, a card's more button) unmounts: opening the dialog usually replaces that
   * menu in the same render, and by then focus has fallen to `<body>`.
   */
  restoreFocusTo: HTMLElement | null;
}

/** A second step for actions that cannot be undone. */
export function ConfirmDialog({
  title,
  detail,
  confirmLabel,
  onCancel,
  onConfirm,
  restoreFocusTo,
}: ConfirmDialogProps) {
  const overlay = useRef<HTMLDivElement | null>(null);
  const cancel = useRef<HTMLButtonElement | null>(null);
  const committed = useRef(false);
  useModalIsolation(overlay);

  const confirm = () => {
    if (committed.current) return;
    committed.current = true;
    onConfirm();
  };
  const dismiss = () => {
    if (!committed.current) onCancel();
  };

  useEffect(() => {
    cancel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        // WebKit's default tab order may skip buttons; keep focus inside the modal.
        event.preventDefault();
        event.stopPropagation();
        const buttons = [
          ...(overlay.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []),
        ];
        if (buttons.length === 0) return;
        const current = buttons.findIndex((button) => button === document.activeElement);
        const next =
          current < 0
            ? event.shiftKey
              ? buttons.length - 1
              : 0
            : (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
        return;
      }
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (!committed.current) onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (restoreFocusTo !== null && document.contains(restoreFocusTo)) restoreFocusTo.focus();
    };
  }, [onCancel, restoreFocusTo]);

  const dialog = (
    <section
      aria-describedby="confirm-detail"
      aria-labelledby="confirm-title"
      aria-modal="true"
      className="confirm-dialog"
      onPointerDown={(event) => event.stopPropagation()}
      role="alertdialog"
    >
      <h2 id="confirm-title">{title}</h2>
      <p id="confirm-detail">{detail}</p>
      <div className="confirm-dialog__actions">
        <button onClick={dismiss} ref={cancel} type="button">
          Cancel
        </button>
        <button data-destructive="" onClick={confirm} type="button">
          {confirmLabel}
        </button>
      </div>
    </section>
  );
  return (
    <div className="confirm-overlay" onPointerDown={dismiss} ref={overlay} role="presentation">
      {dialog}
    </div>
  );
}
