/** Permission consent before a plugin runs: on install, and when an update asks for more. */

import { Dialog } from '../../ui/Dialog.js';
import type { Permission, PluginManifest } from '../format/manifest.js';
import { describePermissions, NEVER, warning } from './permissions.js';

export function ConsentDialog({
  manifest,
  author,
  fresh,
  onAccept,
  onCancel,
}: {
  manifest: PluginManifest;
  author: string;
  /** The newly requested permissions on an update; absent on first install. */
  fresh?: Permission[];
  onAccept: () => void;
  onCancel: () => void;
}) {
  const lines = describePermissions(manifest);
  const danger = warning(manifest);
  const updating = fresh !== undefined;
  return (
    <Dialog
      title={updating ? `Update “${manifest.name}”?` : `Install “${manifest.name}”?`}
      onClose={onCancel}
    >
      <p className="cl-note">
        {author} · version {manifest.pluginVersion}
      </p>
      <p className="pl-consent__lead">
        {updating
          ? 'This version asks for more:'
          : lines.length === 0
            ? 'It asks for nothing.'
            : 'It will be able to:'}
      </p>
      <ul className="pl-permissions">
        {lines
          .filter((line) => !updating || fresh.includes(line.permission))
          .map((line) => (
            <li key={line.permission} className={`pl-permission pl-permission--${line.risk}`}>
              {line.text}
            </li>
          ))}
      </ul>
      {danger === null ? null : (
        <p className="pl-warning" role="alert">
          {danger}
        </p>
      )}
      <p className="cl-note">{NEVER}</p>
      <div className="cl-form__actions">
        <button type="button" className="lessons-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="lessons-button lessons-button--primary" onClick={onAccept}>
          {updating ? 'Update' : 'Install'}
        </button>
      </div>
    </Dialog>
  );
}
