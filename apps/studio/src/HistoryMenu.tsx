/**
 * The right-click menu on a history step: move up or down, or roll back to just after it. The
 * caller refuses moves above a step's dependencies.
 */
import { useEffect } from 'react';
import './menu.css';

interface Props {
  name: string;
  at: { x: number; y: number };
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onRollBack: () => void;
  onClose: () => void;
}

export function HistoryMenu({
  name,
  at,
  canUp,
  canDown,
  onUp,
  onDown,
  onRollBack,
  onClose,
}: Props) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  const item = (label: string, enabled: boolean, run: () => void) => (
    <button
      className="menu__item"
      disabled={!enabled}
      onClick={() => {
        onClose();
        run();
      }}
      role="menuitem"
      type="button"
    >
      {label}
    </button>
  );
  return (
    <div className="pick-through" style={{ left: at.x, top: at.y }}>
      <button aria-label="Close menu" className="menu__scrim" onClick={onClose} type="button" />
      <div aria-label={`${name} in the history`} className="menu" role="menu">
        {item('Move up', canUp, onUp)}
        {item('Move down', canDown, onDown)}
        {item('Roll back to here', true, onRollBack)}
      </div>
    </div>
  );
}
