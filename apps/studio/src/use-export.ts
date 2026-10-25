/**
 * Export: a user-chosen format, progress while it runs and a notice when done. STL and 3MF are
 * meshes (for printing; curves become triangles), STEP keeps exact geometry (for exchange); the
 * chooser explains the difference.
 */

import type { StableRef } from '@bezier/core';
import type { Sketch } from '@bezier/solver';
import { sketchToDxf, sketchToSvg } from '@bezier/ui';
import type { MutableRefObject } from 'react';
import { useCallback } from 'react';
import { save } from './download.js';
import { meshTolerance } from './mesh-quality.js';
import type { Session } from './session.js';
import type { TasksHandle } from './use-tasks.js';

export type ExportFormat = 'stl' | 'step' | '3mf' | 'dxf' | 'svg' | 'bom';

export interface FormatInfo {
  id: ExportFormat;
  label: string;
  extension: string;
  mime: string;
  /** What choosing this costs or keeps, in user terms. */
  note: string;
  /** What it writes: the part, or the open or selected sketch. */
  of: 'part' | 'sketch';
}

export const EXPORT_FORMATS: readonly FormatInfo[] = [
  {
    id: 'step',
    label: 'STEP',
    extension: 'step',
    mime: 'application/step',
    note: 'Keeps the real geometry. For handing the part to another CAD tool.',
    of: 'part',
  },
  {
    id: '3mf',
    label: '3MF',
    extension: '3mf',
    mime: 'model/3mf',
    note: 'A mesh that keeps its units and each body as its own part. For slicers.',
    of: 'part',
  },
  {
    id: 'stl',
    label: 'STL',
    extension: 'stl',
    mime: 'model/stl',
    note: 'A mesh — curves become triangles. For 3D printing.',
    of: 'part',
  },
  {
    id: 'bom',
    label: 'Bill of materials',
    extension: 'csv',
    mime: 'text/csv',
    note: 'One line per distinct part and how many there are, as CSV for a spreadsheet.',
    of: 'part',
  },
  {
    id: 'dxf',
    label: 'DXF',
    extension: 'dxf',
    mime: 'image/vnd.dxf',
    note: 'The sketch, exact, in millimetres. For CAM and other CAD tools.',
    of: 'sketch',
  },
  {
    id: 'svg',
    label: 'SVG',
    extension: 'svg',
    mime: 'image/svg+xml',
    note: 'The sketch as a drawing at true size. For laser cutters.',
    of: 'sketch',
  },
];

export function formatFor(id: ExportFormat): FormatInfo {
  // The list always contains the id, so the fallback is unreachable.
  return EXPORT_FORMATS.find((format) => format.id === id) ?? (EXPORT_FORMATS[0] as FormatInfo);
}

interface ExportDeps {
  sessionRef: MutableRefObject<Session | null>;
  tasks: TasksHandle;
  /** The sketch for DXF and SVG: the open one, else the selected one. */
  sketchRef?: MutableRefObject<{ name: string; sketch: Sketch } | null>;
}

/** Saves the file. */
function handOver(bytes: Uint8Array, name: string, mime: string): Promise<string | null> {
  // Copied into a plain ArrayBuffer: a Uint8Array over a SharedArrayBuffer is not a valid BlobPart,
  // and kernel output may be backed by one.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return save(buffer, name, mime);
}

export function useExport({
  sessionRef,
  tasks,
  sketchRef,
}: ExportDeps): (format: ExportFormat, faces?: readonly StableRef[] | null) => Promise<void> {
  const { begin } = tasks;

  return useCallback(
    async (id: ExportFormat, faces: readonly StableRef[] | null = null) => {
      const session = sessionRef.current;
      if (session === null) return;

      const format = formatFor(id);
      const drawing = format.of === 'sketch' ? (sketchRef?.current ?? null) : null;
      const name = drawing?.name ?? session.document.meta.name;
      const file = `${name}.${format.extension}`;
      const task = begin(`Exporting ${file}`);
      const started = performance.now();

      try {
        const data =
          drawing !== null
            ? id === 'dxf'
              ? sketchToDxf(drawing.sketch)
              : sketchToSvg(drawing.sketch)
            : format.of === 'sketch'
              ? null
              : id === 'stl'
                ? await session.exportStl(faces, meshTolerance())
                : id === '3mf'
                  ? await session.export3mf(faces, meshTolerance())
                  : id === 'bom'
                    ? await session.billOfMaterials()
                    : await session.exportStep(faces);
        if (data === null) {
          task.done({
            title: 'Nothing to export',
            detail:
              format.of === 'sketch'
                ? 'Open or select a sketch first.'
                : 'The document has no solid yet.',
            tone: 'fail',
          });
          return;
        }

        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        // Measured rate: bytes produced over elapsed time.
        const seconds = Math.max((performance.now() - started) / 1000, 0.001);
        task.progress(1, {
          bytesPerSecond: bytes.byteLength / seconds,
          bytesRemaining: 0,
        });

        const written = await handOver(bytes, file, format.mime);
        if (written === null) {
          task.done({ title: 'Export cancelled', detail: file, tone: 'ok' });
          return;
        }
        task.done({
          title: `Exported ${file}`,
          detail: `${format.label} · ${formatSize(bytes.byteLength)}`,
          tone: 'ok',
        });
      } catch (error) {
        task.done({
          title: `Could not export ${file}`,
          detail: error instanceof Error ? error.message : String(error),
          tone: 'fail',
        });
      }
    },
    [sessionRef, sketchRef, begin],
  );
}

/** A human-readable file size. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 100 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}
