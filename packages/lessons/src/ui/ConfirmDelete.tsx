import { useEffect, useRef } from 'react';

interface Props {
  title: string;
  onDelete: () => void;
  onKeep: () => void;
}

/** An inline delete confirmation, used instead of a browser dialog. */
export function ConfirmDelete({ title, onDelete, onKeep }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector('button')?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onKeep();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [onKeep]);
  return (
    <div
      aria-label="Delete this lesson?"
      className="lessons-confirm lessons-glass"
      ref={box}
      role="alertdialog"
    >
      <p>
        Delete <strong>{title}</strong>? It leaves this device for good.
      </p>
      <div>
        <button
          className="lessons-button lessons-button--small lessons-button--danger"
          onClick={onDelete}
          type="button"
        >
          Delete
        </button>
        <button className="lessons-button lessons-button--small" onClick={onKeep} type="button">
          Keep
        </button>
      </div>
    </div>
  );
}
