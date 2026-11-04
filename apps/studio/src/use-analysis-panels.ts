/** Wall thickness and the exploded view: two looks at the model, each opened from the right rail. */

import { useCallback, useState } from 'react';

export function useAnalysisPanels() {
  const [walls, setWalls] = useState(false);
  const [exploded, setExploded] = useState(false);
  /** Runs the rail's command `id`; returns whether it was one of these. */
  const activate = useCallback((id: string): boolean => {
    if (id === 'wall-thickness') setWalls((on) => !on);
    else if (id === 'exploded') setExploded((on) => !on);
    else return false;
    return true;
  }, []);
  return {
    activate,
    active: [walls ? 'wall-thickness' : '', exploded ? 'exploded' : ''],
    panels: {
      walls,
      exploded,
      onCloseWalls: () => setWalls(false),
      onCloseExploded: () => setExploded(false),
    },
  };
}
