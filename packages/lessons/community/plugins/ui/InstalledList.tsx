/**
 * Installed plugins with enable, update and remove. Each is checked with its server when the list
 * opens, so revoked versions are disabled right away.
 */

import { useEffect, useState } from 'react';
import type { Source } from '../../client/sources.js';
import { downloadPlugin } from '../client/api.js';
import { type InstalledPlugin, saveInstalled, uninstall } from '../client/installed.js';
import { checkPlugin, type PluginState } from '../client/updates.js';
import type { PluginPackage } from '../format/package.js';
import { ConsentDialog } from './ConsentDialog.js';
import { describePermissions } from './permissions.js';

type Pending = {
  plugin: InstalledPlugin;
  next: PluginPackage & { sha256: string };
  author: string;
};

export function InstalledList({
  installed,
  sources,
  stopped,
  onChange,
  onMessage,
}: {
  installed: InstalledPlugin[];
  sources: Source[];
  /** Reasons the runtime stopped plugins, by id. */
  stopped: Record<string, string>;
  onChange: (id: string) => void;
  onMessage: (text: string, kind: 'info' | 'error') => void;
}) {
  const [states, setStates] = useState<Record<string, PluginState>>({});
  const [removing, setRemoving] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: once per set of installed versions
  useEffect(() => {
    let live = true;
    for (const plugin of installed) {
      checkPlugin(plugin, sources).then((state) => {
        if (!live) return;
        setStates((before) => ({ ...before, [plugin.id]: state }));
        if (state.kind === 'revoked' && plugin.enabled) onChange(plugin.id);
      });
    }
    return () => {
      live = false;
    };
  }, [installed.map((p) => `${p.id}@${p.manifest.pluginVersion}`).join(), sources]);

  async function save(plugin: InstalledPlugin, next: PluginPackage & { sha256: string }) {
    await saveInstalled({
      ...plugin,
      manifest: next.manifest,
      code: next.code,
      sha256: next.sha256,
      granted: [...next.manifest.permissions],
    });
    onChange(plugin.id);
    onMessage(`“${next.manifest.name}” is now version ${next.manifest.pluginVersion}.`, 'info');
  }

  async function update(plugin: InstalledPlugin) {
    const state = states[plugin.id];
    const source = sources.find((s) => s.url === plugin.source);
    if (state?.kind !== 'update' || source === undefined) return;
    try {
      const next = await downloadPlugin(source, state.entry);
      const fresh = next.manifest.permissions.filter((p) => !plugin.granted.includes(p));
      if (fresh.length === 0) await save(plugin, next);
      else setPending({ plugin, next, author: state.entry.author });
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'The update failed.', 'error');
    }
  }

  async function toggle(plugin: InstalledPlugin, enabled: boolean) {
    await saveInstalled({ ...plugin, enabled });
    onChange(plugin.id);
  }

  async function remove(plugin: InstalledPlugin) {
    setRemoving(null);
    await uninstall(plugin.id);
    onChange(plugin.id);
    onMessage(`“${plugin.manifest.name}” was removed, with everything it stored.`, 'info');
  }

  if (installed.length === 0) {
    return <p className="cl-quiet">No plugins installed. Browse a server to add one.</p>;
  }

  return (
    <ul className="pl-installed-list">
      {installed.map((plugin) => {
        const state = states[plugin.id];
        const revoked = state?.kind === 'revoked';
        const host = (() => {
          try {
            return new URL(plugin.source).host;
          } catch {
            return plugin.source;
          }
        })();
        return (
          <li key={plugin.id} className="pl-row" aria-label={plugin.manifest.name}>
            <label className="cl-switch">
              <input
                type="checkbox"
                role="switch"
                aria-checked={plugin.enabled}
                aria-label={`Run ${plugin.manifest.name}`}
                checked={plugin.enabled}
                disabled={revoked}
                onChange={(event) => void toggle(plugin, event.target.checked)}
              />
              <span className="cl-switch__track" aria-hidden="true" />
              <span className="cl-source__text">
                <span className="cl-source__name">{plugin.manifest.name}</span>
                <span className="cl-source__url">
                  {plugin.manifest.pluginVersion} · {host} ·{' '}
                  {describePermissions(plugin.manifest)
                    .map((line) => line.text)
                    .join(', ') || 'asks for nothing'}
                </span>
              </span>
            </label>
            <span className="pl-row__actions">
              {revoked ? (
                <span className="cl-status cl-status--revoked">Taken back by its server</span>
              ) : stopped[plugin.id] !== undefined ? (
                <span className="cl-status cl-status--rejected">Stopped: {stopped[plugin.id]}</span>
              ) : null}
              {state?.kind === 'update' ? (
                <button
                  type="button"
                  className="lessons-button"
                  onClick={() => void update(plugin)}
                >
                  Update to {state.entry.version}
                </button>
              ) : null}
              {removing === plugin.id ? (
                <>
                  <span className="cl-status">Remove it and its settings?</span>
                  <button
                    type="button"
                    className="cl-text-button"
                    onClick={() => setRemoving(null)}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    className="lessons-button"
                    onClick={() => void remove(plugin)}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="cl-text-button"
                  onClick={() => setRemoving(plugin.id)}
                >
                  Remove
                </button>
              )}
            </span>
          </li>
        );
      })}
      {pending === null ? null : (
        <ConsentDialog
          manifest={pending.next.manifest}
          author={pending.author}
          fresh={pending.next.manifest.permissions.filter(
            (p) => !pending.plugin.granted.includes(p),
          )}
          onAccept={() => {
            setPending(null);
            void save(pending.plugin, pending.next);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </ul>
  );
}
