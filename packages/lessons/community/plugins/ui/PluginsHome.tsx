/**
 * The Plugins page: installed plugins, then the store's catalogue. With the editor's runtime,
 * install, disable and remove take effect immediately.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Source } from '../../client/sources.js';
import { CommunityFrame, type CommunityKind } from '../../ui/CommunityFrame.js';
import { UploadIcon } from '../../ui/icons.js';
import type { Message } from '../../ui/MessageLine.js';
import type { PluginRuntime } from '../runtime/bridge.js';
import { InstalledList } from './InstalledList.js';
import { PluginCard } from './PluginCard.js';
import { PublishDialog } from './PublishDialog.js';
import { useInstalled, usePluginCatalog } from './usePlugins.js';
import './plugins.css';

export function PluginsHome({
  source,
  runtime,
  stopped = {},
  query = '',
  onKind,
}: {
  /** The store's plugins endpoint (`pluginsOf`). */
  source: Source;
  runtime?: PluginRuntime | undefined;
  stopped?: Record<string, string>;
  /** The start page's search text. */
  query?: string;
  onKind?: (next: CommunityKind) => void;
}) {
  const [offline, setOffline] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const catalog = usePluginCatalog(source, query, offline);
  const { installed, refresh } = useInstalled();
  // Refresh when the runtime stops a plugin, since it is disabled in storage.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `stopped` is the trigger
  useEffect(refresh, [stopped, refresh]);

  const say = useCallback(
    (text: string, kind: Message['kind']) => setMessage({ text, kind, at: Date.now() }),
    [],
  );
  const dismiss = useCallback(() => setMessage(null), []);
  const changed = useCallback(
    (id: string) => {
      refresh();
      void runtime?.restart(id);
    },
    [refresh, runtime],
  );
  // Installed versions by id, for the cards.
  const versions = new Map(installed.map((plugin) => [plugin.id, plugin.manifest.pluginVersion]));

  return (
    <CommunityFrame
      actions={
        <button
          className="library__action library__action--primary"
          onClick={() => setPublishing(true)}
          type="button"
        >
          <UploadIcon /> Publish a plugin
        </button>
      }
      kind="plugins"
      message={message}
      note={source.name}
      onDismiss={dismiss}
      onKind={onKind}
      tools={
        <label className="pl-check">
          <input
            checked={offline}
            onChange={(event) => setOffline(event.target.checked)}
            type="checkbox"
          />
          Works without internet
        </label>
      }
    >
      {installed.length > 0 && (
        <section aria-label="Installed plugins" className="cl-section">
          <h2 className="cl-section__title">Installed</h2>
          <InstalledList
            installed={installed}
            onChange={changed}
            onMessage={say}
            sources={[source]}
            stopped={stopped}
          />
        </section>
      )}

      <section aria-label="Available plugins" className="cl-section">
        {installed.length > 0 && <h2 className="cl-section__title">Available</h2>}
        {catalog.error !== null && (
          <div className="cl-inline-error" role="alert">
            <span>{catalog.error}</span>
            <button className="cl-text-button" onClick={catalog.retry} type="button">
              Try again
            </button>
          </div>
        )}
        <div aria-busy={catalog.loading} className="cl-grid">
          {catalog.plugins.map((entry) => (
            <PluginCard
              entry={entry}
              installedVersion={versions.get(entry.id)}
              key={entry.id}
              onInstalled={changed}
              onMessage={say}
              source={source}
            />
          ))}
        </div>
        {!catalog.loading && catalog.error === null && catalog.plugins.length === 0 && (
          <p className="lessons-dim">
            {query.trim() === '' && !offline
              ? 'Nobody has shared a plugin yet.'
              : 'No plugins match.'}
          </p>
        )}
        {catalog.hasMore && !catalog.loading && (
          <button className="library__action cl-more" onClick={catalog.loadMore} type="button">
            Show more
          </button>
        )}
      </section>

      {publishing && <PublishDialog onClose={() => setPublishing(false)} source={source} />}
    </CommunityFrame>
  );
}
