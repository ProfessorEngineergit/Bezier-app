/**
 * Outline of a model still being imported, passed from the rebuild (`RebuildDeps.onPreview`) to the
 * viewport. A one-slot channel: one import at a time, cleared when it ends.
 */

import type { Bounds, EdgeSet, MeshPiece } from '@bezier/kernel';

export interface ImportOutline {
  edges: EdgeSet;
  box: Bounds;
}

let current: ImportOutline | null = null;
/**
 * Offset from the file's position to where the import will be placed (beside existing parts, on the
 * floor; `placement: 'ground'`, `dx`). Without it the outline and streamed parts appear on top of
 * the existing model until the import finishes.
 */
let shift = { x: 0, z: 0 };

function moved(positions: Float32Array): void {
  if (shift.x === 0 && shift.z === 0) return;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    positions[i] = (positions[i] ?? 0) + shift.x;
    positions[i + 2] = (positions[i + 2] ?? 0) + shift.z;
  }
}
const listeners = new Set<(outline: ImportOutline | null) => void>();
const pieceListeners = new Set<(piece: MeshPiece) => void>();

export const importPreview = {
  /** Sets the placement offset; called before the outline is shown. */
  place(next: { x: number; z: number }): void {
    shift = next;
  },
  show(outline: ImportOutline): void {
    moved(outline.edges.positions);
    const { min, max } = outline.box;
    current = {
      edges: outline.edges,
      box: {
        min: { x: min.x + shift.x, y: min.y, z: min.z + shift.z },
        max: { x: max.x + shift.x, y: max.y, z: max.z + shift.z },
      },
    };
    for (const listener of listeners) listener(current);
  },
  clear(): void {
    shift = { x: 0, z: 0 };
    if (current === null) return;
    current = null;
    for (const listener of listeners) listener(null);
  },
  /**
   * The import arrived: forget the outline without removing it. The viewport removes it when it
   * draws the model (`Viewport.setGeometry`), so there is never a frame with neither.
   */
  arrived(): void {
    shift = { x: 0, z: 0 };
    current = null;
  },
  /** Parts of the model as the kernel meshes them (only large models stream). */
  piece(piece: MeshPiece): void {
    moved(piece.positions);
    for (const listener of pieceListeners) listener(piece);
  },
  onPiece(listener: (piece: MeshPiece) => void): () => void {
    pieceListeners.add(listener);
    return () => pieceListeners.delete(listener);
  },
  /** Calls `listener` now and on every change. */
  subscribe(listener: (outline: ImportOutline | null) => void): () => void {
    listeners.add(listener);
    listener(current);
    return () => listeners.delete(listener);
  },
};
