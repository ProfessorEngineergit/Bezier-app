/**
 * What an app keeps on its device, in IndexedDB: settings (the identity among them) and
 * the local copy of every sealed object it has seen. Objects stay sealed here, as on the
 * server; only the identity is plain, because it has to be usable.
 *
 * The object half is the `ObjectCache` the client takes everywhere, so a device is a
 * replica of everything it has opened, readable offline. Used by the sync web app and by
 * the studio, each with its own database name.
 */

import type { ObjectCache } from './repository.ts';

const VERSION = 1;

export class BrowserStore implements ObjectCache {
  readonly #name: string;
  #db: Promise<IDBDatabase> | null = null;

  constructor(name: string) {
    this.#name = name;
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.#run<T | undefined>('settings', 'readonly', (s) => s.get(key));
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.#run('settings', 'readwrite', (s) => s.put(value, key));
  }

  async remove(key: string): Promise<void> {
    await this.#run('settings', 'readwrite', (s) => s.delete(key));
  }

  async read(key: string): Promise<Uint8Array | null> {
    const value = await this.#run<Uint8Array | undefined>('objects', 'readonly', (s) => s.get(key));
    return value ?? null;
  }

  async write(key: string, data: Uint8Array): Promise<void> {
    await this.#run('objects', 'readwrite', (s) => s.put(data.slice(), key));
  }

  /** Forgets everything on this device: the identity and every cached object. */
  async clear(): Promise<void> {
    await this.#run('settings', 'readwrite', (s) => s.clear());
    await this.#run('objects', 'readwrite', (s) => s.clear());
  }

  #open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.#name, VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('settings');
        req.result.createObjectStore('objects');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(req.error ?? new Error('This browser would not open local storage.'));
    });
  }

  #run<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest) {
    this.#db ??= this.#open();
    return this.#db.then(
      (d) =>
        new Promise<T>((resolve, reject) => {
          const tx = d.transaction(store, mode);
          const req = op(tx.objectStore(store));
          // Resolved on commit, not on the request: a write is only kept once the transaction is.
          tx.oncomplete = () => resolve(req.result as T);
          tx.onerror = () => reject(tx.error ?? new Error('Local storage refused the write.'));
          tx.onabort = () => reject(tx.error ?? new Error('Local storage refused the write.'));
        }),
    );
  }
}

/**
 * Asks the browser not to evict this site's storage under pressure. Without it a browser
 * may clear IndexedDB, identity included, when the disk fills.
 */
export async function askToPersist(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
