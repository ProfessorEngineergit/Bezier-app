/**
 * A catalogue plugin card. Install downloads the package and asks for consent before saving it.
 */

import { useState } from 'react';
import type { Source } from '../../client/sources.js';
import { CheckIcon, DownloadIcon, FlagIcon } from '../../ui/icons.js';
import { downloadPlugin, reportPlugin } from '../client/api.js';
import type { PluginEntry } from '../client/catalog.js';
import { saveInstalled } from '../client/installed.js';
import type { PluginPackage } from '../format/package.js';
import { ConsentDialog } from './ConsentDialog.js';
import { describePermissions } from './permissions.js';

export function PluginCard({
  source,
  entry,
  installedVersion,
  onInstalled,
  onMessage,
}: {
  source: Source;
  entry: PluginEntry;
  installedVersion: string | undefined;
  onInstalled: (id: string) => void;
  onMessage: (text: string, kind: 'info' | 'error') => void;
}) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<(PluginPackage & { sha256: string }) | null>(null);

  async function install() {
    setBusy(true);
    try {
      // Ask consent for the permissions the package declares, not the catalogue's.
      setAsking(await downloadPlugin(source, entry));
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : 'The plugin could not be downloaded.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (asking === null) return;
    const { manifest, code, sha256 } = asking;
    setAsking(null);
    try {
      await saveInstalled({
        id: manifest.id,
        manifest,
        code,
        sha256,
        source: source.url,
        enabled: true,
        granted: [...manifest.permissions],
        installedAt: new Date().toISOString(),
      });
      onInstalled(manifest.id);
      onMessage(`“${manifest.name}” is installed.`, 'info');
    } catch (error) {
      console.error('Installing failed.', error);
      onMessage('The plugin could not be installed. Free some space and try again.', 'error');
    }
  }

  async function report() {
    try {
      await reportPlugin(source, entry.id, 'reported from the store');
      onMessage('Thanks. The server’s owner will look at this plugin.', 'info');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'The report failed.', 'error');
    }
  }

  return (
    <article className="cl-card" aria-label={entry.name}>
      <div className="cl-card__text">
        <h3 className="cl-card__title">{entry.name}</h3>
        <p className="cl-card__meta">
          {entry.author} · {entry.version}
        </p>
        <p className="cl-card__description">{entry.description}</p>
        <ul className="pl-chips" aria-label="It may">
          {describePermissions(entry).map((line) => (
            <li key={line.permission} className={`pl-chip pl-chip--${line.risk}`}>
              {line.text}
            </li>
          ))}
        </ul>
      </div>
      <footer className="cl-card__footer">
        <span className="cl-card__spacer" />
        <button
          type="button"
          className="cl-icon-button"
          aria-label="Report this plugin"
          onClick={() => void report()}
        >
          <FlagIcon />
        </button>
        {installedVersion !== undefined ? (
          <span className="pl-installed">
            <CheckIcon /> Installed
          </span>
        ) : (
          <button
            type="button"
            className="lessons-button"
            disabled={busy}
            onClick={() => void install()}
          >
            <DownloadIcon /> {busy ? 'Downloading…' : 'Install'}
          </button>
        )}
      </footer>
      {asking === null ? null : (
        <ConsentDialog
          manifest={asking.manifest}
          author={entry.author}
          onAccept={() => void accept()}
          onCancel={() => setAsking(null)}
        />
      )}
    </article>
  );
}
