/**
 * A model being imported: its outline on screen (renderer `import-preview.ts`) and its space kept
 * clear. Clicks inside that space are blocked with a notice at the click; orbit and zoom still
 * work.
 */

/// <reference lib="dom" />

import type { Viewport as Scene } from '@bezier/renderer';
import { type RefObject, useEffect } from 'react';
import { importPreview } from './import-preview.js';

const HINT_MS = 2200;

export function useImportPreview(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  sceneRef: RefObject<Scene | null>,
): void {
  useEffect(
    () =>
      importPreview.subscribe((outline) => {
        const scene = sceneRef.current;
        if (scene === null) return;
        const colour = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
        scene.showImportPreview(outline, colour || undefined);
      }),
    [sceneRef],
  );

  useEffect(
    () =>
      importPreview.onPiece((piece) => {
        sceneRef.current?.showImportPiece(piece);
      }),
    [sceneRef],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let hint: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const guard = (event: MouseEvent) => {
      const scene = sceneRef.current;
      if (scene === null) return;
      const box = canvas.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      if (!scene.hitsImportPreview(x, y)) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      hint?.remove();
      hint = document.createElement('div');
      hint.className = 'import-guard';
      hint.textContent = 'A model is arriving here. Work outside its outline until it is in.';
      hint.style.left = `${x}px`;
      hint.style.top = `${y}px`;
      canvas.parentElement?.appendChild(hint);
      clearTimeout(timer);
      timer = setTimeout(() => {
        hint?.remove();
        hint = null;
      }, HINT_MS);
    };
    // Capture phase, so selection and tools never see the click.
    canvas.addEventListener('click', guard, true);
    canvas.addEventListener('dblclick', guard, true);
    return () => {
      canvas.removeEventListener('click', guard, true);
      canvas.removeEventListener('dblclick', guard, true);
      clearTimeout(timer);
      hint?.remove();
    };
  }, [canvasRef, sceneRef]);
}
