/** Typed numbers take over a drag without stealing ordinary tool shortcuts on a selection. */
import { useEffect, useRef, useState } from 'react';
export function useEdgeNumber({
  size,
  onStart,
  onPreview,
  onCommit,
}: {
  size: number;
  onStart: () => void;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false),
    [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const cancelBlur = useRef(false);
  const active = useRef(false);
  active.current = editing;
  const start = (first?: string) => {
    cancelBlur.current = false;
    onStart();
    setText(first ?? String(size));
    setEditing(true);
    if (first !== undefined && Number.isFinite(Number(first))) onPreview(Number(first));
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        active.current ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        !/^[0-9.,]$/.test(event.key)
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest('input,textarea,select') || target.isContentEditable)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      start(event.key);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
  useEffect(() => {
    if (editing) {
      input.current?.focus();
      const length = input.current?.value.length ?? 0;
      input.current?.setSelectionRange(length, length);
    }
  }, [editing]);
  return {
    editing,
    text,
    input,
    start,
    change(value: string) {
      setText(value);
      const number = Number(value.replace(',', '.'));
      if (value.trim() !== '' && Number.isFinite(number) && number > 0) onPreview(number);
    },
    finish() {
      if (!active.current) return;
      active.current = false;
      setEditing(false);
      const value = Number(text.replace(',', '.'));
      if (!cancelBlur.current && text.trim() !== '' && Number.isFinite(value) && value >= 0)
        onCommit(value);
      cancelBlur.current = false;
    },
    cancel() {
      cancelBlur.current = true;
      active.current = false;
      setEditing(false);
    },
  };
}
