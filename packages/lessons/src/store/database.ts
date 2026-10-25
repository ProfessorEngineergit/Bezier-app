/**
 * IndexedDB helpers. Each transaction opens and closes its own connection, since a long-lived
 * connection would block version upgrades from other tabs or the editor.
 */

export interface StoreSpec {
  keyPath?: string;
  autoIncrement?: boolean;
  /** Index name and key path pairs. */
  indexes?: [string, string][];
}

export interface DatabaseSpec {
  name: string;
  version: number;
  stores: Record<string, StoreSpec>;
}

export const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('The database request failed.'));
  });

function open(spec: DatabaseSpec): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(spec.name, spec.version);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      for (const [name, store] of Object.entries(spec.stores)) {
        if (db.objectStoreNames.contains(name)) continue;
        const created = db.createObjectStore(name, {
          ...(store.keyPath === undefined ? {} : { keyPath: store.keyPath }),
          autoIncrement: store.autoIncrement ?? false,
        });
        for (const [index, keyPath] of store.indexes ?? []) created.createIndex(index, keyPath);
      }
    };
    opening.onblocked = () =>
      reject(new Error('The lesson store is open in another window; close it and try again.'));
    opening.onerror = () =>
      reject(opening.error ?? new Error('The lesson store could not be opened.'));
    opening.onsuccess = () => resolve(opening.result);
  });
}

/**
 * Runs `work` in one transaction over `names`. Only await requests on those stores inside it;
 * awaiting anything else lets the transaction auto-commit.
 */
export async function transact<T>(
  spec: DatabaseSpec,
  names: string | string[],
  mode: IDBTransactionMode,
  work: (store: (name: string) => IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await open(spec);
  try {
    const list = Array.isArray(names) ? names : [names];
    const tx = db.transaction(list, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('The database transaction was abandoned.'));
      tx.onerror = () => reject(tx.error ?? new Error('The database transaction failed.'));
    });
    try {
      // Observe both promises immediately: a failed request also rejects the transaction.
      const [result] = await Promise.all([
        Promise.resolve().then(() => work((name) => tx.objectStore(name))),
        done,
      ]);
      return result;
    } catch (problem) {
      try {
        tx.abort();
      } catch {
        // A failed request may already have aborted or completed this transaction.
      }
      throw problem;
    }
  } finally {
    db.close();
  }
}

/** All records in a store or index, in key order. */
export function getAll<T>(store: IDBObjectStore | IDBIndex, query?: IDBValidKey | IDBKeyRange) {
  return request(store.getAll(query)) as Promise<T[]>;
}
