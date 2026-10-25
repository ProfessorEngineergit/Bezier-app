/**
 * Application startup: kernel worker, solver, document store and session. Outside React so the
 * shell renders before any of it finishes (ADR 0007, rule E).
 */

import { RebuildCache } from '@bezier/core';
import { createKernel } from '@bezier/kernel';
import {
  type DocumentInfo,
  DocumentStore,
  IndexedDbBackend,
  isOpfsAvailable,
  MemoryBackend,
  OpfsBackend,
  type StorageBackend,
} from '@bezier/storage';
import { importPreview } from './import-preview.js';
import { loadSolver } from './placeholder-solver.js';
import type { SessionDeps } from './session.js';

export type { DocumentInfo };

export interface Booted {
  deps: SessionDeps;
  documents: readonly DocumentInfo[];
  /** True while the stand-in solver is in use; the UI has to say so. */
  placeholderSolver: boolean;
  /** Why the real solver did not start, when it did not. */
  solverReason: string | undefined;
  /** True when documents are only in memory and will not survive a reload. */
  ephemeralStorage: boolean;
  /** Explains a persistent fallback when browser file storage cannot be opened. */
  storageNotice: string | undefined;
  /** Set when the geometry worker had to be restarted. */
  onKernelRestart: (listener: (reason: string) => void) => void;
}

export async function boot(): Promise<Booted> {
  const listeners: Array<(reason: string) => void> = [];

  const kernel = await createKernel({
    onRestart: (reason) => {
      for (const listener of listeners) listener(reason);
    },
    // A large model builds up on screen as it is meshed, part by part.
    onPiece: (piece) => importPreview.piece(piece),
  });

  const { solver, placeholder, reason } = await loadSolver();

  const { backend, ephemeralStorage, storageNotice } = await browserStorage();

  const deps: SessionDeps = {
    kernel,
    solver,
    store: new DocumentStore(backend),
    // The rebuild cache is also the crash-recovery cache (ADR 0009).
    cache: new RebuildCache(),
    loadOffThread: backend instanceof OpfsBackend,
    onPreview: (outline) => importPreview.show(outline),
  };

  // Nothing is open yet, so every empty project is one left behind.
  await deps.store.discardEmpty();
  const documents = await deps.store.listDocuments();
  // Start the geometry worker now, while the user picks a project, instead of on its first call
  // (about 250 ms).

  return {
    deps,
    documents,
    placeholderSolver: placeholder,
    solverReason: reason,
    ephemeralStorage,
    storageNotice,
    onKernelRestart: (listener) => listeners.push(listener),
  };
}

async function browserStorage(): Promise<{
  backend: StorageBackend;
  ephemeralStorage: boolean;
  storageNotice?: string | undefined;
}> {
  // A browser can expose the OPFS method yet fail when opening it (WebKit does this in restricted
  // profiles). Probe the actual root before creating a store.
  const offered = isOpfsAvailable();
  if (offered) {
    try {
      await navigator.storage.getDirectory();
      return { backend: new OpfsBackend(), ephemeralStorage: false };
    } catch {
      // IndexedDB below preserves edits without an OPFS root.
    }
  }

  try {
    const backend = new IndexedDbBackend();
    await backend.ready();
    return {
      backend,
      ephemeralStorage: false,
      // Only when the browser offers OPFS and it fails to open (a restricted profile). WebKit on
      // Linux, and so the Linux desktop app, offers none and uses IndexedDB, which is not a fault.
      storageNotice: offered
        ? 'Browser file storage is unavailable. Projects saved there come back when it is.'
        : undefined,
    };
  } catch {
    return { backend: new MemoryBackend(), ephemeralStorage: true };
  }
}
