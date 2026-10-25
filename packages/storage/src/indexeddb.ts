/** Persistent browser fallback when OPFS exists in the API but cannot be opened. */
import type { StorageBackend } from './backend.js';

interface FileRow {
  key: string;
  data: Uint8Array;
}
interface SegmentRow {
  id: number;
  key: string;
  data: Uint8Array;
}

const FILES = 'files';
const SEGMENTS = 'segments';
const BY_KEY = 'byKey';

function committed<T>(tx: IDBTransaction, result: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(result());
    tx.onabort = () => reject(tx.error ?? new Error('The local database write was interrupted.'));
    tx.onerror = () => reject(tx.error ?? new Error('The local database write failed.'));
  });
}

export class IndexedDbBackend implements StorageBackend {
  #database: Promise<IDBDatabase> | null = null;

  async ready(): Promise<void> {
    await this.#open();
  }

  #open(): Promise<IDBDatabase> {
    this.#database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('bezier-projects', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(SEGMENTS))
          db.createObjectStore(SEGMENTS, { keyPath: 'id', autoIncrement: true }).createIndex(
            BY_KEY,
            'key',
          );
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.#database = null;
        };
        resolve(db);
      };
    });
    return this.#database;
  }

  async write(key: string, data: Uint8Array): Promise<void> {
    const db = await this.#open();
    const tx = db.transaction([FILES, SEGMENTS], 'readwrite');
    tx.objectStore(FILES).put({ key, data: new Uint8Array(data) } satisfies FileRow);
    const cursor = tx.objectStore(SEGMENTS).index(BY_KEY).openCursor(IDBKeyRange.only(key));
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (entry) {
        entry.delete();
        entry.continue();
      }
    };
    await committed(tx, () => undefined);
  }

  async append(key: string, data: Uint8Array): Promise<void> {
    const db = await this.#open();
    const tx = db.transaction(SEGMENTS, 'readwrite');
    tx.objectStore(SEGMENTS).add({ key, data: new Uint8Array(data) });
    await committed(tx, () => undefined);
  }

  async read(key: string): Promise<Uint8Array | null> {
    const db = await this.#open();
    const tx = db.transaction([FILES, SEGMENTS], 'readonly');
    const base = tx.objectStore(FILES).get(key) as IDBRequest<FileRow | undefined>;
    const parts = tx
      .objectStore(SEGMENTS)
      .index(BY_KEY)
      .getAll(IDBKeyRange.only(key)) as IDBRequest<SegmentRow[]>;
    return committed(tx, () => {
      const file = base.result?.data;
      const segments = parts.result;
      if (!file && segments.length === 0) return null;
      const size =
        (file?.byteLength ?? 0) + segments.reduce((sum, part) => sum + part.data.byteLength, 0);
      const combined = new Uint8Array(size);
      let offset = 0;
      if (file) {
        combined.set(file);
        offset = file.byteLength;
      }
      for (const part of segments) {
        combined.set(part.data, offset);
        offset += part.data.byteLength;
      }
      return combined;
    });
  }

  async list(prefix: string): Promise<readonly string[]> {
    const db = await this.#open();
    const tx = db.transaction([FILES, SEGMENTS], 'readonly');
    const files = tx.objectStore(FILES).getAllKeys() as IDBRequest<string[]>;
    const names = new Set<string>();
    const cursor = tx.objectStore(SEGMENTS).index(BY_KEY).openKeyCursor();
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (entry) {
        names.add(String(entry.key));
        entry.continue();
      }
    };
    return committed(tx, () =>
      [...new Set([...files.result, ...names])].filter((key) => key.startsWith(prefix)).sort(),
    );
  }

  async remove(key: string): Promise<void> {
    const db = await this.#open();
    const tx = db.transaction([FILES, SEGMENTS], 'readwrite');
    tx.objectStore(FILES).delete(key);
    const cursor = tx.objectStore(SEGMENTS).index(BY_KEY).openCursor(IDBKeyRange.only(key));
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (entry) {
        entry.delete();
        entry.continue();
      }
    };
    await committed(tx, () => undefined);
  }
}
