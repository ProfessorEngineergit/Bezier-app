/**
 * A modal built on the native `<dialog>`, so Escape, focus trapping and the backdrop come from the
 * browser.
 */

import { type ReactNode, useEffect, useRef } from 'react';
import { CloseIcon } from './icons.js';

export function Dialog({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Wider layout, e.g. for pictures or long text. */
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes it via onCancel
    <dialog
      ref={ref}
      className="cl-dialog"
      data-wide={wide ? '' : undefined}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Backdrop clicks target the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="cl-dialog__body">
        <header className="cl-dialog__header">
          <h2 className="cl-dialog__title">{title}</h2>
          <button type="button" className="cl-icon-button" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
