/**
 * Plays the history like a sped-up recording of it being made. Each step opens its tool in the
 * rail, the camera glides to where it stood when the step was made, and the step is built; a sketch
 * draws its shapes one tool at a time. Steps made before cameras were kept turn the view a little
 * instead. A press anywhere but the History panel, or Escape, ends it where it is.
 *
 * Nothing here touches the document, the real tool or the selection: the rail and the shown sketch
 * read the cue, and the model is the rollback marker.
 */
import type { FeatureRecord } from '@bezier/core';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { rollbackAt } from './history-playback.js';
import { sketchOf, sketchTools, stepCue, type TimelapseCue } from './timelapse-script.js';
import type { ViewportHandle } from './Viewport.js';

/** How long a tool shows before its step appears. */
const TOOL_MS = 340;
/** A little more than a camera glide. */
const CAMERA_MS = 360;
/** Each tool in a sketch. */
const DRAW_MS = 260;
/** How long a finished step stays. */
const HOLD_MS = 240;
/** A quarter of a right angle, for a step with no camera. */
const TURN = Math.PI / 8;

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

export function useTimelapse(
  features: readonly FeatureRecord[],
  built: number,
  onRollback: (at: number | null) => void,
  onCue: (cue: TimelapseCue | null) => void,
  viewport: RefObject<ViewportHandle | null>,
) {
  const [running, setRunning] = useState(false);
  /** The run under way; a new object per run, so a stopped run sees it is no longer current. */
  const current = useRef<object | null>(null);
  const reached = useRef<{ at: number; done: () => void } | null>(null);
  const builtRef = useRef(built);
  builtRef.current = built;

  useEffect(() => {
    if (reached.current?.at === built) reached.current.done();
  }, [built]);

  /** Waits for the build, so a slow model plays slower instead of queueing. */
  const buildTo = useCallback(
    (at: number) =>
      new Promise<void>((done) => {
        onRollback(rollbackAt(at, features.length));
        if (builtRef.current === at) done();
        else reached.current = { at, done };
      }),
    [features.length, onRollback],
  );

  const stop = useCallback(() => {
    current.current = null;
    reached.current?.done();
    reached.current = null;
    onCue(null);
    setRunning(false);
  }, [onCue]);

  const start = useCallback(async () => {
    const run = {};
    const live = () => current.current === run;
    current.current = run;
    setRunning(true);
    const camera = viewport.current;
    const from = camera?.cameraView();
    await buildTo(0);
    for (const [index, feature] of features.entries()) {
      if (!live()) return;
      const sketch = sketchOf(feature);
      const tools = sketch === null ? [] : sketchTools(sketch);
      onCue(
        sketch === null
          ? stepCue(feature.type)
          : {
              category: 'sketch',
              tool: tools[0]?.tool ?? null,
              sketch: { id: feature.id, shapes: 0 },
            },
      );
      await pause(TOOL_MS);
      if (!live()) return;
      if (feature.view !== undefined) camera?.showCameraView(feature.view, true);
      else camera?.spin(TURN, true);
      await pause(CAMERA_MS);
      if (!live()) return;
      await buildTo(index + 1);
      for (const { tool, shapes } of tools) {
        if (!live()) return;
        onCue({ category: 'sketch', tool, sketch: { id: feature.id, shapes } });
        await pause(DRAW_MS);
      }
      if (sketch !== null && live()) {
        onCue({ category: 'sketch', tool: 'exit' });
        await pause(DRAW_MS);
      }
      if (!live()) return;
      onCue(null);
      await pause(HOLD_MS);
    }
    if (!live()) return;
    stop();
    if (from !== undefined) camera?.showCameraView(from, true);
  }, [buildTo, features, onCue, stop, viewport]);

  useEffect(() => {
    if (!running) return;
    const press = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.history-panel')) return;
      stop();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stop();
    };
    window.addEventListener('pointerdown', press, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', press, true);
      window.removeEventListener('keydown', key);
    };
  }, [running, stop]);

  useEffect(() => stop, [stop]);

  return { running, start, stop };
}
