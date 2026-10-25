/**
 * Deforms the viewport like cloth under a file dragged over it. Listens on the window, like the
 * drop (`use-transfer.ts`), and passes the position to the scene (renderer `fabric.ts`). Files the
 * import cannot read leave the view still.
 */

/// <reference lib="dom" />

import type { Viewport as Scene } from '@bezier/renderer';
import { type RefObject, useEffect } from 'react';
import { carriesFiles, looksImportable } from './drag-files.js';

export function useDragFabric(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  sceneRef: RefObject<Scene | null>,
): void {
  useEffect(() => {
    const over = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      const canvas = canvasRef.current;
      const scene = sceneRef.current;
      if (canvas === null || scene === null) return;
      if (!looksImportable(event.dataTransfer)) {
        scene.pressFabric(null);
        return;
      }
      const box = canvas.getBoundingClientRect();
      scene.pressFabric({ x: event.clientX - box.left, y: event.clientY - box.top });
    };
    const gone = () => sceneRef.current?.pressFabric(null);
    // Also fires when leaving inner elements; only leaving the window (no related target) counts.
    const leave = (event: DragEvent) => {
      if (event.relatedTarget === null) gone();
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', gone);
    window.addEventListener('dragend', gone);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', gone);
      window.removeEventListener('dragend', gone);
    };
  }, [canvasRef, sceneRef]);
}
