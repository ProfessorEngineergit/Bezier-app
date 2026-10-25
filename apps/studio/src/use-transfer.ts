/**
 * Bringing geometry in: drag-and-drop import, copy, paste and duplicate, all reported through the
 * task strip and a notice.
 *
 * STEP becomes a body through an Import feature that keeps the file text (ADR 0012); STL and OBJ
 * become reference meshes; DXF and SVG become sketches; images (any format the window can decode)
 * are placed on a plane.
 *
 * In the desktop app the native file panel is opened by the shell's `open_files` command; files
 * opened from Finder arrive through `window.__bezierImport`. Either way the page gets a name and a
 * one-time token and fetches the raw bytes through `read_import` (`open.rs` explains why not base64
 * in JSON).
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';
import { askQuestion } from './ask-question.js';
import { carriesFiles, looksImportable } from './drag-files.js';
import { IMAGE_EXTENSIONS, looksLikeImage } from './image/image-read.js';
import { importTooLarge } from './machine-memory.js';
import { MODEL_BUSY_MESSAGE, type ModelLock } from './model-lock.js';
import type { TasksHandle } from './use-tasks.js';

/**
 * Share of the bar for reading the file. Reading is measured per byte; building reports nothing, so
 * that stretch is estimated from file size and only completes when the work does.
 */
const READ_SHARE = 0.15;
/**
 * Assumed kernel throughput for the estimate, in bytes per millisecond. Measured on STEP, the slow
 * case: a 97 MB file took 87 s to build and under a second to read, hence the small read share.
 */
const BUILD_BYTES_PER_MS = 1100;
/** How long the bar stays at 100% before the notice replaces it. */
const FINISH_MS = 380;

/** Reads a file in chunks, reporting bytes read and the rate so far. */
async function readWithProgress(
  file: File,
  onProgress: (loaded: number, bytesPerSecond: number) => void,
): Promise<Uint8Array> {
  const started = performance.now();
  if (typeof file.stream !== 'function') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    onProgress(
      bytes.byteLength,
      bytes.byteLength / Math.max(0.001, (performance.now() - started) / 1000),
    );
    return bytes;
  }
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, loaded / Math.max(0.001, (performance.now() - started) / 1000));
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress(loaded, loaded / Math.max(0.001, (performance.now() - started) / 1000));
  return bytes;
}

/**
 * Advances the bar during the build: eases toward 99%, paced by the file size, never past it.
 */
function startBuilding(
  task: { progress: (fraction: number, detail?: { phase?: string }) => void },
  size: number,
): { stop: () => void } {
  const started = performance.now();
  const expected = Math.min(30 * 60_000, Math.max(400, size / BUILD_BYTES_PER_MS));
  const tick = () => {
    const t = (performance.now() - started) / expected;
    const eased = 1 - Math.exp(-2.2 * t);
    // Past the expected time (slow machine, heavy file), the bar says so instead of sitting at 99%.
    task.progress(READ_SHARE + (0.99 - READ_SHARE) * eased, {
      phase: t > 1.5 ? 'Still building' : 'Building',
    });
  };
  tick();
  const timer = window.setInterval(tick, 50);
  return { stop: () => window.clearInterval(timer) };
}

/** File extensions worth attempting. */
const ACCEPTED = [
  '.step',
  '.stp',
  '.igs',
  '.iges',
  '.stl',
  '.obj',
  '.dxf',
  '.svg',
  '.bezier',
  ...IMAGE_EXTENSIONS,
];

export interface TransferHandle {
  /** True while a file is over the window; the stage shows its drop state. */
  dropping: boolean;
  /** Asks for a file and imports it (Insert → File). */
  pickFile: () => void;
}

interface TransferDeps {
  tasks: TasksHandle;
  /**
   * Held from the first byte read, not just during the build: reading a 241 MB STEP file takes long
   * enough to start an extrude that would land mid-import.
   */
  lock: ModelLock;
  /** Imports STEP text. Resolves to null when it became bodies, or to the reason it did not. */
  importStep: (name: string, text: string) => Promise<string | null>;
  /** Imports a mesh file as a reference. Resolves to an error, or null. */
  importMesh: (name: string, bytes: Uint8Array) => Promise<string | null>;
  /** Imports a 2D drawing (DXF, SVG) as a sketch. Resolves to an error, or null. */
  importDrawing: (name: string, text: string) => Promise<string | null>;
  /** Places an image on a plane. Resolves to an error, or null. */
  importImage: (name: string, bytes: Uint8Array, type: string) => Promise<string | null>;
  /** Opens a project backup (`.bezier`) as a new project. Resolves to an error, or null. */
  importProject: (name: string, text: string) => Promise<string | null>;
}

export function useTransfer({
  tasks,
  lock,
  importStep,
  importMesh,
  importDrawing,
  importImage,
  importProject,
}: TransferDeps): TransferHandle {
  const [dropping, setDropping] = useState(false);
  const { begin, notify } = tasks;

  const receive = useCallback(
    async (file: File) => {
      const name = file.name.toLowerCase();
      const picture = looksLikeImage(file.name, file.type);
      if (!picture && !ACCEPTED.some((extension) => name.endsWith(extension))) {
        notify({
          title: `Cannot import ${file.name}`,
          detail: `Accepted formats: ${ACCEPTED.join(', ')}.`,
          tone: 'fail',
        });
        return;
      }

      const kind = picture
        ? 'image'
        : name.endsWith('.bezier')
          ? 'project'
          : name.endsWith('.dxf') || name.endsWith('.svg')
            ? 'drawing'
            : name.endsWith('.stl') || name.endsWith('.obj')
              ? 'mesh'
              : 'solid';
      // Ask first when the machine likely lacks the memory, rather than let the OS kill the app
      // mid-import (e.g. the Voron on 8 GB).
      const tight = kind === 'solid' ? importTooLarge(file.size) : null;
      if (
        tight !== null &&
        !(await askQuestion({
          title: 'This file may not fit in memory',
          message: `Reading ${file.name} needs about ${tight.need} of memory, and this computer has ${tight.have}. The app may close before the model is in; your project is saved as it is now. Import it anyway?`,
          yes: 'Import anyway',
          no: 'Cancel',
        }))
      )
        return;
      const reading = lock.tryHold();
      if (reading === null) {
        notify({ title: `Cannot import ${file.name} yet`, detail: MODEL_BUSY_MESSAGE });
        return;
      }
      const task = begin(`Importing ${file.name}`);
      try {
        let bytes: Uint8Array;
        try {
          bytes = await readWithProgress(file, (loaded, perSecond) => {
            task.progress((loaded / Math.max(1, file.size)) * READ_SHARE, {
              phase: 'Reading',
              bytesPerSecond: perSecond,
              bytesRemaining: Math.max(0, file.size - loaded),
            });
          });
        } finally {
          // Handed directly to the building change, which takes the lock in the same tick, so
          // nothing can start in between.
          reading();
        }
        const building = startBuilding(task, bytes.byteLength);
        let refused: string | null;
        try {
          refused =
            kind === 'image'
              ? await importImage(file.name, bytes, file.type)
              : kind === 'project'
                ? await importProject(file.name, new TextDecoder().decode(bytes))
                : kind === 'mesh'
                  ? await importMesh(file.name, bytes)
                  : kind === 'drawing'
                    ? await importDrawing(file.name, new TextDecoder().decode(bytes))
                    : await importStep(file.name, new TextDecoder().decode(bytes));
        } finally {
          building.stop();
        }
        if (refused === null) {
          // Briefly at 100% before the notice, so the bar is seen to finish.
          task.progress(1, { phase: 'Done' });
          await new Promise((resolve) => window.setTimeout(resolve, FINISH_MS));
        }
        task.done(
          refused === null
            ? {
                title: `Imported ${file.name}`,
                ...(kind === 'image'
                  ? { detail: 'As a picture on the XY plane. Drag it into place and size.' }
                  : kind === 'project'
                    ? { detail: 'As a new project in All Projects.' }
                    : kind === 'mesh'
                      ? { detail: 'As a reference mesh to model against.' }
                      : kind === 'drawing'
                        ? { detail: 'As a sketch on the XY plane.' }
                        : {}),
              }
            : { title: `Could not import ${file.name}`, detail: refused, tone: 'fail' },
        );
      } catch (error) {
        task.done({
          title: `Could not read ${file.name}`,
          detail: error instanceof Error ? error.message : String(error),
          tone: 'fail',
        });
      }
    },
    [begin, notify, lock, importStep, importMesh, importDrawing, importImage, importProject],
  );

  /**
   * The whole window is the drop target: listening on `window` means drops on the rail, title bar
   * or canvas behave the same, on every platform.
   *
   * `dragover` must be cancelled, or the browser navigates to the file and loses unsaved work.
   */
  useEffect(() => {
    // Drag events fire for every child entered and left; a counter keeps the state from flickering.
    let depth = 0;

    const over = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      const welcome = looksImportable(event.dataTransfer);
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = welcome ? 'copy' : 'none';
      // The drop area follows the cursor, written directly to the element to avoid a React render
      // per pointer move.
      const zone = document.querySelector<HTMLElement>('.dropzone');
      if (zone !== null) {
        const box = zone.getBoundingClientRect();
        zone.style.setProperty('--drop-x', `${event.clientX - box.left}px`);
        zone.style.setProperty('--drop-y', `${event.clientY - box.top}px`);
      }
    };
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth += 1;
      setDropping(looksImportable(event.dataTransfer));
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDropping(false);
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth = 0;
      setDropping(false);
      const files = event.dataTransfer?.files;
      if (files === undefined) return;
      for (const file of Array.from(files)) void receive(file);
    };

    window.addEventListener('dragover', over);
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [receive]);

  const pickFile = useCallback(() => {
    if (isTauri()) {
      void invoke<{ name: string; token: string }[]>('open_files')
        .then(async (files) => {
          for (const file of files) await receive(await chosenFile(file.name, file.token));
        })
        .catch((error: unknown) => {
          notify({
            title: 'Could not open the file',
            detail: error instanceof Error ? error.message : String(error),
            tone: 'fail',
          });
        });
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPTED.join(',');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file !== undefined) void receive(file);
    });
    input.click();
  }, [receive, notify]);

  // The desktop shell's Import menu item opens the same panel; files opened from Finder arrive as a
  // name and a read token.
  useEffect(() => {
    const onImport = () => pickFile();
    const target = window as Window & {
      __bezierImport?: (name: string, token: string) => void;
      /** Files the shell received before this was set up (opened from a file manager at start). */
      __bezierPending?: [string, string][];
    };
    target.__bezierImport = (name, token) => {
      void chosenFile(name, token)
        .then(receive)
        .catch((error: unknown) =>
          notify({
            title: `Could not open ${name}`,
            detail: error instanceof Error ? error.message : String(error),
            tone: 'fail',
          }),
        );
    };
    for (const [name, token] of target.__bezierPending ?? []) target.__bezierImport(name, token);
    delete target.__bezierPending;
    window.addEventListener('bezier:import', onImport);
    return () => {
      window.removeEventListener('bezier:import', onImport);
      delete target.__bezierImport;
    };
  }, [pickFile, receive, notify]);

  return { dropping, pickFile };
}

/** A file chosen in the desktop app, fetched raw from the shell. */
async function chosenFile(name: string, token: string): Promise<File> {
  const bytes = await invoke<ArrayBuffer>('read_import', { token });
  return new File([bytes], name);
}
