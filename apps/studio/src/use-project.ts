/**
 * Project management, as opposed to model editing: renaming, the project menu, work in flight, and
 * imports and duplicates. Kept out of `App.tsx`, which turns clicks into journal operations.
 */

import type { Operation, TessellationChoice } from '@bezier/core';
import {
  type Bounds,
  cancelBackgroundReads,
  DEFAULT_TESSELLATION,
  type GeometryKernel,
  parseStepOutline,
  readStepInBackground,
  textKey,
} from '@bezier/kernel';
import { dxfToSketch, emptySketch, svgToSketch } from '@bezier/ui';
import { type MutableRefObject, useCallback, useRef } from 'react';
import { freeName } from './feature-names.js';
import { encodeMesh, readMesh } from './formats/mesh-read.js';
import { readImage } from './image/image-read.js';
import { firstPlacement, placementParams } from './image/placement.js';
import { importPreview } from './import-preview.js';
import type { ModelLock } from './model-lock.js';
import { besideShift, boundsOf, occupiedBy } from './occupied-space.js';
import { openBackup } from './project-backup.js';
import type { Session, SessionDeps, SessionView } from './session.js';
import { outlinesAsSketches } from './surface-sketches.js';
import { cancelBuild } from './use-cancel-build.js';
import type { TasksHandle } from './use-tasks.js';
import { useTasks } from './use-tasks.js';
import type { TransferHandle } from './use-transfer.js';
import { useTransfer } from './use-transfer.js';

export interface ProjectHandle {
  tasks: TasksHandle;
  transfer: TransferHandle;
  rename: (name: string) => void;
  /** Stops the model being read or built now. */
  cancelImport: () => void;
}

interface ProjectDeps {
  run: (change: (session: Session) => Promise<SessionView>) => Promise<void>;
  lock: ModelLock;
  /** For the tessellation setting of a background import. */
  depsRef: MutableRefObject<SessionDeps | null>;
  /** An image was placed; the page selects it so its handles show at once. */
  onImageAdded?: (id: string) => void;
}

/**
 * STEP files below this many characters are read by the project's own worker (see `importStep`).
 */
const SMALL_STEP = 2_000_000;

/** X offset that places a grounded STEP part beside existing content. */
function asideOf(box: Bounds): number {
  return besideShift(occupiedBy('solid'), {
    min: { ...box.min, z: 0 },
    max: { ...box.max, z: box.max.z - box.min.z },
  });
}

/** One background read at a time, so two large files are never in memory together. */
let reading: Promise<unknown> = Promise.resolve();

/**
 * Reads a STEP file in a dedicated geometry worker before importing it, so the project's worker
 * stays free (`readStepInBackground`). The import that follows works regardless: it finds the
 * stored result or reads the file itself.
 */
function readFirst(
  text: string,
  choice: TessellationChoice | undefined,
  onBox: (box: Bounds) => void,
): Promise<unknown> {
  const setting = (faces: number) =>
    typeof choice === 'function' ? choice(faces) : (choice ?? DEFAULT_TESSELLATION);
  const next = reading.then(() =>
    readStepInBackground(text, {
      key: textKey(text),
      tessellation: setting,
      onOutline: (outline) => {
        onBox(outline.box);
        importPreview.place({ x: asideOf(outline.box), z: -outline.box.min.z });
        importPreview.show(outline);
      },
      onPiece: (piece) => importPreview.piece(piece),
    }),
  );
  reading = next.catch(() => undefined);
  return next.catch(() => false);
}

/** A STEP file's flat faces as sketch steps, or null when it has none. */
async function surfacesAsSketches(
  kernel: GeometryKernel,
  session: Session,
  name: string,
  text: string,
): Promise<Operation[] | null> {
  const read = await kernel.importStep(text);
  if (!read.ok) return null;
  try {
    const outlines = await kernel.flatOutlines(read.value);
    if (!outlines.ok || outlines.value.length === 0) return null;
    const base = name.replace(/\.(step|stp)$/i, '');
    return outlinesAsSketches(outlines.value, base, session.document.features.length);
  } finally {
    await kernel.dispose(read.value);
  }
}

export function useProject({ run, lock, depsRef, onImageAdded }: ProjectDeps): ProjectHandle {
  const tasks = useTasks();

  /** A STEP or IGES file as an Import feature, added only if it builds. */
  /** Set when the import in flight was cancelled (`cancelImport`); checked between steps. */
  const cancelled = useRef(false);

  const importStep = useCallback(
    async (name: string, text: string): Promise<string | null> => {
      cancelled.current = false;
      const iges = /\.(igs|iges)$/i.test(name);
      // The part's position in its file, from the STEP outline before building: enough to place it
      // beside existing content.
      let box: Bounds | null = null;
      // Small files are read in place: a dedicated worker takes a second or more to start (five to
      // eight seconds for a 7 KB box in a Linux VM). Their outline comes from the text.
      if (!iges && text.length < SMALL_STEP) box = parseStepOutline(text)?.box ?? null;
      else if (!iges)
        await readFirst(text, depsRef.current?.tessellation, (found) => {
          box = found;
        });
      if (cancelled.current) {
        importPreview.clear();
        return 'The import was stopped.';
      }
      const incoming = box as Bounds | null;
      const dx = incoming === null ? 0 : asideOf(incoming);
      let refused: string | null = 'The project is not open.';
      await run(async (session) => {
        const id = `import-${String(Date.now())}`;
        const tried = await session.tryApply(
          {
            op: 'addFeature',
            id,
            type: 'import-step',
            name: freeName(
              session.document,
              `Import ${name.replace(/\.(step|stp|igs|iges)$/i, '')}`,
            ),
            index: session.document.features.length,
            // Named in file order, so a new import skips measuring every face.
            params: {
              file: text,
              faceOrder: 'file',
              placement: 'ground',
              dx,
              ...(iges ? { format: 'iges' } : {}),
            },
          },
          id,
        );
        refused = tried.refused;
        if (refused === null || !refused.includes('holds no solid')) return tried.view;
        // Loose surfaces and no solid: flat ones become sketches (audit F-017).
        const kernel = depsRef.current?.kernel;
        const sketches =
          kernel === undefined ? null : await surfacesAsSketches(kernel, session, name, text);
        if (sketches === null) return tried.view;
        refused = null;
        return session.apply(sketches);
      });
      // Refused or failed: remove the outline. Arrived: it stays until the view draws the model.
      if (refused === null) importPreview.arrived();
      else importPreview.clear();
      return refused;
    },
    [run, depsRef],
  );

  /** A mesh (STL, OBJ) as a reference to model against: drawn, not built. */
  const importMesh = useCallback(
    async (name: string, bytes: Uint8Array): Promise<string | null> => {
      const read = readMesh(name, bytes);
      if (!read.ok) return read.message;
      let bottom = Infinity;
      for (let i = 2; i < read.positions.length; i += 3)
        bottom = Math.min(bottom, read.positions[i] ?? 0);
      if (Number.isFinite(bottom))
        for (let i = 2; i < read.positions.length; i += 3)
          read.positions[i] = (read.positions[i] ?? 0) - bottom;
      // Beside existing content, not inside it.
      const meshBox = boundsOf(read.positions);
      const aside = meshBox === null ? 0 : besideShift(occupiedBy('solid'), meshBox);
      if (aside !== 0)
        for (let i = 0; i < read.positions.length; i += 3)
          read.positions[i] = (read.positions[i] ?? 0) + aside;
      let refused: string | null = 'The project is not open.';
      await run(async (session) => {
        const id = `mesh-${String(Date.now())}`;
        const tried = await session.tryApply(
          {
            op: 'addFeature',
            id,
            type: 'reference-mesh',
            name: freeName(session.document, name.replace(/\.(stl|obj)$/i, '')),
            index: session.document.features.length,
            params: { mesh: encodeMesh(read.positions) },
          },
          id,
        );
        refused = tried.refused;
        return tried.view;
      });
      return refused;
    },
    [run],
  );

  /** A DXF or SVG drawing as a new sketch on the XY plane. */
  const importDrawing = useCallback(
    async (name: string, text: string): Promise<string | null> => {
      const read = /\.svg$/i.test(name)
        ? svgToSketch(text, emptySketch())
        : dxfToSketch(text, emptySketch());
      if (!read.ok) return read.message;
      let refused: string | null = 'The project is not open.';
      await run(async (session) => {
        const id = `sketch-${String(Date.now())}`;
        const tried = await session.tryApply(
          {
            op: 'addFeature',
            id,
            type: 'sketch',
            name: freeName(session.document, name.replace(/\.(dxf|svg)$/i, '')),
            index: session.document.features.length,
            params: { plane: 'XY', sketch: read.sketch, face: [] },
          },
          id,
        );
        refused = tried.refused;
        return tried.view;
      });
      return refused;
    },
    [run],
  );

  /** An image on the XY plane, longer side 100 mm, to be dragged into place and size. */
  const importImage = useCallback(
    async (name: string, bytes: Uint8Array, type: string): Promise<string | null> => {
      const read = await readImage(name, new Uint8Array(bytes), type);
      if (!read.ok) return read.message;
      const { image } = read;
      const id = `image-${String(Date.now())}`;
      // A second image goes beside the first.
      const first = firstPlacement(image.pixelWidth, image.pixelHeight);
      const placement = {
        ...first,
        x: besideShift(occupiedBy('picture'), {
          min: { x: -first.width / 2, y: -first.height / 2, z: 0 },
          max: { x: first.width / 2, y: first.height / 2, z: 0 },
        }),
      };
      let refused: string | null = 'The project is not open.';
      await run(async (session) => {
        const tried = await session.tryApply(
          {
            op: 'addFeature',
            id,
            type: 'reference-image',
            name: freeName(session.document, name.replace(/\.[a-z0-9]+$/i, '')),
            index: session.document.features.length,
            params: {
              image: image.data,
              mime: image.mime,
              pixelWidth: image.pixelWidth,
              pixelHeight: image.pixelHeight,
              plane: 'XY',
              offset: 0,
              opacity: 0.8,
              ...placementParams(placement),
            },
          },
          id,
        );
        refused = tried.refused;
        return tried.view;
      });
      if (refused === null) onImageAdded?.(id);
      return refused;
    },
    [run, onImageAdded],
  );

  const importProject = useCallback(
    (name: string, text: string) => openBackup(depsRef.current?.store, name, text),
    [depsRef],
  );
  const transfer = useTransfer({
    tasks,
    lock,
    importStep,
    importMesh,
    importDrawing,
    importImage,
    importProject,
  });

  /**
   * Renames through the journal (`renameDocument`, which inverts), so the rename is undoable. Hence
   * the title bar does not write to the store directly.
   */
  const rename = useCallback(
    (name: string) => {
      void run((session) => session.apply({ op: 'renameDocument', name }));
    },
    [run],
  );

  /**
   * Cancels the import in flight: reading stops at once (background workers are terminated), and a
   * build under way is cancelled as Escape does, which reverts it.
   */
  const cancelImport = useCallback(() => {
    cancelled.current = true;
    cancelBackgroundReads();
    cancelBuild(depsRef.current, lock);
  }, [depsRef, lock]);

  return {
    tasks,
    transfer,
    rename,
    cancelImport,
  };
}
