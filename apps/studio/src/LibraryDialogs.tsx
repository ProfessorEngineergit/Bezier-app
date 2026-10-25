import type { DashboardIndex } from '@bezier/storage';
import { type ReactNode, useEffect, useRef } from 'react';
import type { DocumentInfo } from './boot.js';
import { useModalIsolation } from './use-modal-isolation.js';

interface MoveProjectDialogProps {
  doc: DocumentInfo;
  index: DashboardIndex;
  currentFolder: string | null;
  onClose: () => void;
  onMove: (folderId: string | null) => void;
  restoreFocusTo: HTMLElement | null;
}

export function MoveProjectDialog({
  doc,
  index,
  currentFolder,
  onClose,
  onMove,
  restoreFocusTo,
}: MoveProjectDialogProps) {
  return (
    <LibraryDialog
      label="Move project"
      onClose={onClose}
      restoreFocusTo={restoreFocusTo}
      title={`Move “${doc.name}”`}
    >
      <p className="library-dialog__note">Choose where this project should live.</p>
      <div className="library-dialog__destinations">
        <button
          data-current={currentFolder === null ? '' : undefined}
          onClick={() => onMove(null)}
          type="button"
        >
          <span>Projects</span>
          {currentFolder === null && <small>Current</small>}
        </button>
        {index.folders.map((folder) => (
          <button
            data-current={currentFolder === folder.id ? '' : undefined}
            key={folder.id}
            onClick={() => onMove(folder.id)}
            type="button"
          >
            <span>{folder.name}</span>
            {currentFolder === folder.id && <small>Current</small>}
          </button>
        ))}
      </div>
      <div className="library-dialog__actions">
        <button onClick={onClose} type="button">
          Cancel
        </button>
      </div>
    </LibraryDialog>
  );
}

export interface LibraryDialogProps {
  label: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /**
   * Focused again once the dialog closes. The caller must capture it synchronously before the
   * card's menu unmounts; see `ConfirmDialog`'s `restoreFocusTo`, which this mirrors.
   */
  restoreFocusTo: HTMLElement | null;
}

export function LibraryDialog({
  label,
  title,
  onClose,
  children,
  restoreFocusTo,
}: LibraryDialogProps) {
  const dialog = useRef<HTMLDivElement | null>(null);
  useModalIsolation(dialog);

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('button, input')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (restoreFocusTo !== null && document.contains(restoreFocusTo)) restoreFocusTo.focus();
    };
  }, [onClose, restoreFocusTo]);

  return (
    <div className="library-dialog-overlay" onPointerDown={onClose} role="presentation">
      <div
        aria-label={label}
        aria-modal="true"
        className="library-dialog"
        onPointerDown={(event) => event.stopPropagation()}
        ref={dialog}
        role="dialog"
        tabIndex={-1}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
