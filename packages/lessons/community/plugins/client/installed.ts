/**
 * Installed plugins and their key-value storage, in a separate database (`bezier-plugins`) so
 * plugin data never shares a transaction with the user's lessons and can be removed as a whole.
 */

import type { Permission, PluginManifest } from '../format/manifest.js';
import { PLUGIN_LIMITS } from '../format/manifest.js';

export interface InstalledPlugin {
  id: string;
  manifest: PluginManifest;
  code: string;
  sha256: string;
  /** The source server, for updates and revocations. */
  source: string;
  enabled: boolean;
  /** Permissions the user granted; the runtime refuses everything else. */
  granted: Permission[];
  installedAt: string;
}

const DB_NAME = 'bezier-plugins';
const PLUGINS = 'plugins';
const STORAGE = 'storage';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PLUGINS, { keyPath: 'id' });
      request.result.createObjectStore(STORAGE, { keyPath: ['plugin', 'key'] });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(
  name: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const request = work(tx.objectStore(name));
    // Resolve on commit, not on request success.
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error ?? request.error);
    };
  });
}

export const listInstalled = (): Promise<InstalledPlugin[]> =>
  run<InstalledPlugin[]>(PLUGINS, 'readonly', (store) => store.getAll());

export const getInstalled = (id: string): Promise<InstalledPlugin | undefined> =>
  run<InstalledPlugin | undefined>(PLUGINS, 'readonly', (store) => store.get(id));

export async function saveInstalled(plugin: InstalledPlugin): Promise<void> {
  await run(PLUGINS, 'readwrite', (store) => store.put(plugin));
}

/** Uninstalls a plugin and deletes its stored data. */
export async function uninstall(id: string): Promise<void> {
  await run(PLUGINS, 'readwrite', (store) => store.delete(id));
  await run(STORAGE, 'readwrite', (store) => store.delete(IDBKeyRange.bound([id, ''], [id, '￿'])));
}

// ---- plugin storage ---------------------------------------------------------

interface Entry {
  plugin: string;
  key: string;
  value: string;
}

export async function storageGet(plugin: string, key: string): Promise<string | null> {
  const entry = await run<Entry | undefined>(STORAGE, 'readonly', (store) =>
    store.get([plugin, key]),
  );
  return entry?.value ?? null;
}

export async function storageRemove(plugin: string, key: string): Promise<void> {
  await run(STORAGE, 'readwrite', (store) => store.delete([plugin, key]));
}

/** Throws a message for the plugin when the write would exceed its quota. */
export async function storageSet(plugin: string, key: string, value: string): Promise<void> {
  const entries = await run<Entry[]>(STORAGE, 'readonly', (store) =>
    store.getAll(IDBKeyRange.bound([plugin, ''], [plugin, '￿'])),
  );
  const used = entries
    .filter((entry) => entry.key !== key)
    .reduce((sum, entry) => sum + entry.key.length + entry.value.length, 0);
  if (used + key.length + value.length > PLUGIN_LIMITS.storageBytes) {
    throw new Error('This plugin has used its 1 MB of storage.');
  }
  await run(STORAGE, 'readwrite', (store) => store.put({ plugin, key, value }));
}
