/** The workspaces the title bar switches between, in the order work flows. */
import {
  DesignIcon,
  DrawingsIcon,
  SimulationIcon,
  VisualizationIcon,
  type WorkspaceMode,
} from '@bezier/ui';

export const WORKSPACES: readonly WorkspaceMode[] = [
  {
    id: 'design',
    label: 'Modeling',
    icon: <DesignIcon />,
    note: 'Sketch, model and refine solids.',
    available: true,
  },
  {
    id: 'simulation',
    label: 'Simulation',
    icon: <SimulationIcon />,
    note: 'Loads, supports, stress and topology.',
    available: true,
  },
  {
    id: 'visualize',
    label: 'Visualize',
    icon: <VisualizationIcon />,
    note: 'Materials, studio lighting and renders.',
    available: true,
  },
  {
    id: 'drawings',
    label: 'Drawings',
    icon: <DrawingsIcon />,
    note: 'Technical sheets, dimensions and vector exports.',
    available: true,
  },
];

export type StudioMode = 'design' | 'simulation' | 'visualize' | 'drawings';
