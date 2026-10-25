/** @bezier/storage: durable local storage for the core journal. See docs/adr/0009-durability.md. */

export type { StorageBackend } from './backend.js';
export { decode, encode, layout } from './backend.js';
export { IndexedDbBackend } from './indexeddb.js';
export { MemoryBackend } from './memory.js';
export { isOpfsAvailable, OpfsBackend } from './opfs.js';
export type { DashboardIndex, FolderInfo } from './organization.js';
export { emptyIndex, folderOf } from './organization.js';
export type { DocumentInfo, LoadResult } from './store.js';
export { DocumentStore } from './store.js';
