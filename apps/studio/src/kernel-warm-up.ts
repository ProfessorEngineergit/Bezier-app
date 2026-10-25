/**
 * Starts the geometry engine just before it is needed. The first solid of a session otherwise pays
 * for worker start-up and WebAssembly compilation (228 ms in Chromium, 276 ms in WebKit, ten times
 * a warm box). Starting at boot is ruled out by ADR 0007 (rule E, enforced by `viewport.spec.ts`),
 * so it starts on the first sign of modelling: pointer on the rail or a key in the editor, a few
 * hundred milliseconds before the click that needs it.
 */

import type { GeometryKernel } from '@bezier/kernel';
import { type MutableRefObject, useEffect } from 'react';
import type { SessionDeps } from './session.js';

/** Starts the engine once, on the first pointer over the rail or key press. */
export function useKernelWarmUp(
  depsRef: MutableRefObject<SessionDeps | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const start = (event: Event) => {
      if (event.type === 'pointerover') {
        const target = event.target;
        if (!(target instanceof Element) || target.closest('.rail') === null) return;
      }
      const deps = depsRef.current;
      if (deps === null) return;
      stop();
      void warmUp(deps.kernel);
    };
    const stop = () => {
      window.removeEventListener('pointerover', start);
      window.removeEventListener('keydown', start);
    };
    window.addEventListener('pointerover', start);
    window.addEventListener('keydown', start);
    return stop;
  }, [depsRef, active]);
}

/** Builds a first solid once. Failures are ignored. */
async function warmUp(kernel: GeometryKernel): Promise<void> {
  const square = {
    loops: [
      [
        { kind: 'line' as const, start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
        { kind: 'line' as const, start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
        { kind: 'line' as const, start: { x: 10, y: 10 }, end: { x: 0, y: 10 } },
        { kind: 'line' as const, start: { x: 0, y: 10 }, end: { x: 0, y: 0 } },
      ],
    ],
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    xDirection: { x: 1, y: 0, z: 0 },
  };
  try {
    const box = await kernel.extrude(square, 10);
    if (!box.ok) return;
    await kernel.tessellate(box.value);
    await kernel.extractEdges(box.value);
    await kernel.describeFaces(box.value);
    await kernel.dispose(box.value);
  } catch {
    // The real first call will start it instead.
  }
}
