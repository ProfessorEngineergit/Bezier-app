import { Icon } from '../ui/Icon.js';
import { SHORTCUTS } from './useShortcuts.js';

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div aria-label="Keyboard shortcuts" className="lessons-help lessons-glass" role="dialog">
      <div className="lessons-help__head">
        <span className="lessons-label">Keys</span>
        <button
          aria-label="Close"
          className="lessons-button lessons-button--quiet lessons-button--icon lessons-button--small"
          onClick={onClose}
          type="button"
        >
          <Icon name="close" />
        </button>
      </div>
      <dl className="lessons-help__list">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.does + shortcut.keys.join()}>
            <dt>
              {shortcut.keys.map((key) => (
                <kbd className="lessons-kbd" key={key}>
                  {key}
                </kbd>
              ))}
            </dt>
            <dd>{shortcut.does}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
