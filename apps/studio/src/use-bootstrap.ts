/**
 * Application startup as a hook: one-time kernel boot, its notices and the project list. Holds no
 * state; `App` passes in its setters.
 */

import type { DocumentInfo } from '@bezier/storage';
import type { MutableRefObject } from 'react';
import { useEffect } from 'react';
import { type Booted, boot } from './boot.js';
import { finishLoading, finishLoadingAfterPaint } from './boot-loader.js';
import type { Said } from './said.js';
import type { SessionDeps } from './session.js';

let booting: Promise<Booted> | null = null;

/** Boots once, however many times the effect runs. */
function bootOnce(): Promise<Booted> {
  booting ??= boot();
  return booting;
}

export interface BootstrapSinks {
  depsRef: MutableRefObject<SessionDeps | null>;
  setNotices: (update: (all: readonly Said[]) => readonly Said[]) => void;
  replaceNotices: (messages: readonly Said[]) => void;
  setDocuments: (docs: readonly DocumentInfo[]) => void;
  setBusy: (busy: boolean) => void;
  setFatal: (message: string) => void;
  /** Called when the geometry engine had to restart; read at that moment. */
  engineRestartRef: MutableRefObject<() => void>;
}

/**
 * Boots the kernel, solver and store once per module, and lists the projects. Not once per effect:
 * StrictMode runs effects twice in development, and two kernel workers writing the same document is
 * rejected by OPFS.
 */
export function useBootstrap(sinks: BootstrapSinks): void {
  const { depsRef, setNotices, replaceNotices, setDocuments, setBusy, setFatal, engineRestartRef } =
    sinks;

  useEffect(() => {
    let cancelled = false;

    bootOnce()
      .then(async (booted) => {
        if (cancelled) return;
        depsRef.current = booted.deps;
        setDocuments(booted.documents);

        // Exposes which solver is active.
        document.documentElement.dataset.solver = booted.placeholderSolver ? 'stand-in' : 'real';
        const messages: Said[] = [];
        if (booted.placeholderSolver) {
          // On every start, with the reason, so a missing real solver is noticed.
          if (booted.solverReason !== undefined)
            document.documentElement.dataset.solverError = booted.solverReason;
          messages.push({
            title: 'Constraints are kept, not solved yet',
            detail: `The constraint solver could not start (${booted.solverReason ?? 'unknown reason'}). Typed dimensions still drive the geometry.`,
          });
        }
        if (booted.ephemeralStorage) {
          messages.push({
            title: 'Projects will not be saved',
            detail: 'This browser allows no local storage, so a reload loses them.',
            tone: 'fail',
            sticky: true,
          });
        }
        if (booted.storageNotice) {
          messages.push({
            title: 'Saving to IndexedDB',
            detail: booted.storageNotice,
            once: 'storage-indexeddb',
          });
        }
        booted.onKernelRestart((reason) => {
          // The reason goes to the console; the notice is for the user.
          console.warn(`geometry engine restarted: ${reason}`);
          engineRestartRef.current();
          setNotices((all) => [
            ...all,
            {
              title: 'The geometry engine restarted',
              detail:
                'The last step did not finish. The model is being built again from what was saved.',
              tone: 'fail',
            },
          ]);
        });
        replaceNotices(messages);

        // The start page only needs the document list. The loader is for opening or creating a
        // project (`useDashboard` shows it again then).
        setBusy(false);
        // Wait for the start page's list to be painted, not just loaded, before hiding the loader.
        finishLoadingAfterPaint();

        // No document is opened here; projects are opened and rebuilt when chosen on the start
        // page.
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFatal(error instanceof Error ? error.message : String(error));
          setBusy(false);
          // Hide the loader so the failure reason can be read.
          finishLoading();
        }
      });

    return () => {
      cancelled = true;
    };
    // All dependencies are stable setters or refs (bootOnce guards the double boot); listed to
    // satisfy the exhaustive-deps lint.
  }, [depsRef, setNotices, replaceNotices, setDocuments, setBusy, setFatal, engineRestartRef]);
}
