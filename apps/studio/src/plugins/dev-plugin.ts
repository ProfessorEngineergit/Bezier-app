/**
 * A plugin in development, loaded from its author's dev server (`bezier-plugin dev`) and restarted
 * on each save. Only from this machine (http://127.0.0.1 or localhost), in the same sandbox with
 * the same permission checks as an installed plugin; it gets its manifest's permissions, since the
 * author grants them. Never added to the installed list (`DEVELOPMENT` source).
 */

import {
  DEVELOPMENT,
  isPluginManifest,
  manifestProblem,
  type PluginManifest,
} from '@bezier/lessons';
import { useEffect, useSyncExternalStore } from 'react';
import type { Said } from '../said.js';
import { usePluginState } from './plugin-state.js';

const KEY = 'bezier.plugin-dev';
const listeners = new Set<() => void>();

export function devPluginAddress(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/** Why `address` cannot be a dev server, in a sentence, or null. */
export function devAddressProblem(address: string): string | null {
  try {
    const url = new URL(address);
    const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    return url.protocol === 'http:' && local
      ? null
      : 'A development server runs on this computer: http://127.0.0.1 and a port.';
  } catch {
    return 'That is not an address. It looks like http://127.0.0.1:5199.';
  }
}

export function setDevPluginAddress(address: string): void {
  try {
    if (address === '') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, address);
  } catch {
    // Without storage the address lasts until the window closes, fine for development.
  }
  for (const listener of listeners) listener();
}

export function useDevPluginAddress(): string {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, devPluginAddress);
}

/** Runs the plugin at the dev address and reruns it whenever its server signals a change. */
export function useDevPlugin(say: (message: string | Said) => void): void {
  const { runtime } = usePluginState();
  const address = useDevPluginAddress();

  useEffect(() => {
    if (runtime === null || address === '' || devAddressProblem(address) !== null) return;
    const base = address.replace(/\/+$/, '');
    let running: string | null = null;
    let stopped = false;

    const load = async () => {
      try {
        const [manifest, code] = await Promise.all([
          fetch(`${base}/plugin.json`, { cache: 'no-store' }).then(
            (r) => r.json() as Promise<unknown>,
          ),
          fetch(`${base}/main.js`, { cache: 'no-store' }).then((r) => r.text()),
        ]);
        if (stopped) return;
        if (!isPluginManifest(manifest)) {
          say({
            title: 'Plugin in development',
            detail: manifestProblem(manifest) ?? 'Not a plugin.',
          });
          return;
        }
        if (running !== null) runtime.stop(running);
        // An installed copy of the same plugin steps aside while its author works on it.
        runtime.stop(manifest.id);
        running = manifest.id;
        await runtime.start(asInstalled(manifest, code, base));
        say({ title: manifest.name, detail: 'Loaded from your development server.' });
      } catch (problem) {
        say({
          title: 'Plugin in development',
          detail:
            problem instanceof Error ? problem.message : 'The development server did not answer.',
        });
      }
    };

    void load();
    const changes = new EventSource(`${base}/events`);
    changes.addEventListener('change', () => void load());
    return () => {
      stopped = true;
      changes.close();
      if (running !== null) runtime.stop(running);
    };
  }, [runtime, address, say]);
}

function asInstalled(manifest: PluginManifest, code: string, base: string) {
  return {
    id: manifest.id,
    manifest,
    code,
    sha256: '',
    source: `${DEVELOPMENT}${base}`,
    enabled: true,
    granted: [...manifest.permissions],
    installedAt: new Date().toISOString(),
  };
}
