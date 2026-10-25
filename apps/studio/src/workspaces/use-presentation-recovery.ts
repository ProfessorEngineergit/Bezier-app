/**
 * Recovers Visualize after GPU device or WebGL context loss. Three's WebGPURenderer (including its
 * WebGL2 fallback) never draws again even after the browser restores the context, so the renderer
 * is restarted on a new canvas (three's dispose loses the old canvas's context). Model, materials
 * and face colours return through the ready state; camera and decals are carried over. After a
 * few losses a minute it stops restarting and waits for a click.
 */

import type { DecalPlacement, PresentationRenderer } from '@bezier/renderer';
import { useCallback, useRef, useState } from 'react';

const RESTARTS = 3;
const WINDOW_MS = 60_000;

/** Losses still counted at `now`, including this one, and whether to restart automatically. */
export function afterLoss(
  losses: readonly number[],
  now: number,
): { losses: number[]; restart: boolean } {
  const recent = [...losses.filter((at) => now - at < WINDOW_MS), now];
  return { losses: recent, restart: recent.length <= RESTARTS };
}

interface Carried {
  position: number[];
  target: number[];
  decals: readonly DecalPlacement[];
}

export function usePresentationRecovery() {
  /** Bumped for each fresh start: the canvas's key, and a dependency of the effect that starts it. */
  const [generation, setGeneration] = useState(0);
  const [stopped, setStopped] = useState(false);
  const losses = useRef<number[]>([]);
  const carried = useRef<Carried | null>(null);

  const lost = useCallback((renderer: PresentationRenderer) => {
    carried.current = {
      position: renderer.camera.position.toArray(),
      target: renderer.controls.target.toArray(),
      decals: renderer.decalPlacements,
    };
    const next = afterLoss(losses.current, performance.now());
    losses.current = next.losses;
    if (next.restart) setGeneration((value) => value + 1);
    else setStopped(true);
  }, []);

  /**
   * Runs on the fresh renderer once it has the model: restores the previous view, and the decals
   * once bodies are shown. Returns a message when a decal could not be restored, so the loss is
   * reported.
   */
  const restore = useCallback(async (renderer: PresentationRenderer): Promise<string | null> => {
    const before = carried.current;
    carried.current = null;
    if (before === null) return null;
    renderer.camera.position.fromArray(before.position);
    renderer.controls.target.fromArray(before.target);
    renderer.controls.update();
    if (before.decals.length === 0) return null;
    try {
      const missed = await renderer.restoreDecals(before.decals);
      if (missed === 0) return null;
      return `${missed === 1 ? 'One decal' : `${missed} decals`} could not be put back after the renderer restarted.`;
    } catch {
      return 'The decals could not be put back after the renderer restarted.';
    }
  }, []);

  const restart = useCallback(() => {
    losses.current = [];
    setStopped(false);
    setGeneration((value) => value + 1);
  }, []);

  return { generation, stopped, lost, restore, restart };
}
