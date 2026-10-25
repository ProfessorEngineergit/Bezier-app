/**
 * The Simulation workspace over the canvas, laid out like Visualize and Drawings: placements in the
 * Items panel on the left, placement tools in the rail, study settings and Solve in the top bar,
 * and missing inputs, the edited placement and results on the right (`SimulationInspector`). Loads
 * are placed by clicking faces, and the solve runs on its own thread so the part stays orbitable.
 */

import { type RefObject, useEffect } from 'react';
import type { ViewportHandle } from '../Viewport.js';
import { useSidePanel } from '../workspaces/use-side-panel.js';
import { PlacementGlyphs } from './PlacementGlyphs.js';
import { SimulationInspector } from './SimulationInspector.js';
import { TOOL_TEXT } from './SimulationParts.js';
import { StudyBar } from './StudyBar.js';
import { StudyBrowser } from './StudyBrowser.js';
import type { SimulationHandle } from './use-simulation.js';
import './simulation.css';
import './sim-inspector.css';

export { format } from './SimulationParts.js';

/** Study panel width, matching Visualize's inspector. */
const INSPECTOR_WIDTH = 304;

export interface SimulationWorkspaceProps {
  sim: SimulationHandle;
  handleRef: RefObject<ViewportHandle | null>;
  browserOpen: boolean;
  projectName: string;
  itemsWidth: number;
  onItemsWidth: (width: number) => void;
  onOpenDrawings: () => void;
}

export function SimulationWorkspace({
  sim,
  handleRef,
  browserOpen,
  projectName,
  itemsWidth,
  onItemsWidth,
  onOpenDrawings,
}: SimulationWorkspaceProps) {
  useSidePanel(INSPECTOR_WIDTH, true);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
        return;
      if (event.key === 'Escape') {
        if (sim.editing !== null) sim.setEditing(null);
        else if (sim.tool !== null) sim.setTool(null);
      }
      if (event.key === 'Enter' && sim.editing !== null) sim.setEditing(null);
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        sim.solve();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [sim]);

  return (
    <div className="sim" style={{ ['--sim-inspector' as string]: `${INSPECTOR_WIDTH}px` }}>
      <PlacementGlyphs handleRef={handleRef} sim={sim} />
      <StudyBar sim={sim} />
      {sim.tool !== null && sim.editing === null && (
        <div className="sim-hint" role="status">
          {TOOL_TEXT[sim.tool].icon}
          <span>{TOOL_TEXT[sim.tool].hint}</span>
          <kbd>Esc</kbd>
        </div>
      )}
      {browserOpen && <StudyBrowser onWidthChange={onItemsWidth} sim={sim} width={itemsWidth} />}
      <SimulationInspector
        handleRef={handleRef}
        onOpenDrawings={onOpenDrawings}
        projectName={projectName}
        sim={sim}
      />
    </div>
  );
}
