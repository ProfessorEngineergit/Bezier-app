/**
 * Plays the history from the top: the playhead walks down one step at a time. The next step starts
 * only once the last one has been built and shown, so a slow model plays slower instead of queueing
 * builds. Play at the end starts over from nothing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { playMove, rollbackAt } from './history-playback.js';

/** How long a built step stays on screen. */
const STEP_MS = 700;

export function useHistoryPlayback(
  built: number,
  steps: number,
  onRollback: (at: number | null) => void,
) {
  const [playing, setPlaying] = useState(false);
  const rewinding = useRef(false);

  useEffect(() => {
    if (!playing) return;
    const move = playMove(built, steps, rewinding.current);
    if (move === 'wait') return;
    rewinding.current = false;
    if (move === 'end') {
      setPlaying(false);
      return;
    }
    const next = setTimeout(() => onRollback(rollbackAt(built + 1, steps)), STEP_MS);
    return () => clearTimeout(next);
  }, [playing, built, steps, onRollback]);

  const stop = useCallback(() => {
    rewinding.current = false;
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (built >= steps) {
      rewinding.current = true;
      onRollback(0);
    }
    setPlaying(true);
  }, [built, steps, onRollback]);

  return { playing, play, stop };
}
