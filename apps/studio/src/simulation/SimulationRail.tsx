/** The left rail while simulating: what each button is, and what it does. */

import {
  ConvectionIcon,
  FixedIcon,
  ForceIcon,
  FrictionlessIcon,
  GravityIcon,
  HeatIcon,
  OptimiseIcon,
  PinIcon,
  PressureIcon,
  type RailGroup,
  StressIcon,
  StudyIcon,
  TemperatureIcon,
  TemperatureMapIcon,
} from '@bezier/ui';
import type React from 'react';
import type { SimTool, SimulationHandle } from './use-simulation.js';

const TOOL_IDS: readonly SimTool[] = [
  'fixed',
  'pin',
  'frictionless',
  'force',
  'pressure',
  'temperature',
  'heat',
  'convection',
];

/** The left rail while simulating: supports, loads, then solve and results. */
export function simulationRail(sim: SimulationHandle): readonly RailGroup[] {
  const gravity = sim.study.loads.some((load) => load.kind === 'gravity');
  const optimising = sim.study.kind === 'shape-optimisation';
  const thermal = sim.study.kind === 'thermal';
  const results = resultsGroup(
    sim,
    thermal ? <TemperatureMapIcon /> : optimising ? <OptimiseIcon /> : <StressIcon />,
  );
  const browser = {
    id: 'workspace',
    items: [{ id: 'sim-browser', label: 'Study', icon: <StudyIcon /> }],
  };
  if (thermal)
    return [
      browser,
      {
        id: 'sim-thermal',
        zone: 'centre',
        ...neededFor(sim, 'sim-thermal'),
        items: [
          { id: 'temperature', label: 'Temperature', icon: <TemperatureIcon /> },
          { id: 'heat', label: 'Heat', icon: <HeatIcon /> },
          { id: 'convection', label: 'Convection', icon: <ConvectionIcon /> },
        ],
      },
      results,
    ];
  return [
    browser,
    {
      id: 'sim-supports',
      zone: 'centre',
      ...neededFor(sim, 'sim-supports'),
      items: [
        { id: 'fixed', label: 'Fixed', icon: <FixedIcon /> },
        { id: 'pin', label: 'Pin', icon: <PinIcon /> },
        { id: 'frictionless', label: 'Frictionless', icon: <FrictionlessIcon /> },
      ],
    },
    {
      id: 'sim-loads',
      zone: 'centre',
      ...neededFor(sim, 'sim-loads'),
      items: [
        { id: 'force', label: 'Force', icon: <ForceIcon /> },
        { id: 'pressure', label: 'Pressure', icon: <PressureIcon /> },
        { id: 'gravity', label: 'Gravity', icon: <GravityIcon />, detail: gravity ? 'On' : 'Off' },
      ],
    },
    results,
  ];
}

/** The rail mark on a group the study still needs input from, and what is needed. */
function neededFor(sim: SimulationHandle, group: string): { needed?: string } {
  const needs = sim.missing.filter((need) => need.group === group).map((need) => need.what);
  return needs.length === 0 ? {} : { needed: `Still needed: ${needs.join('; ')}` };
}

function resultsGroup(sim: SimulationHandle, icon: React.ReactNode): RailGroup {
  return {
    id: 'sim-run',
    zone: 'bottom',
    items: [
      // Solve lives only in the study panel.
      {
        id: 'results',
        label: 'Results',
        icon,
        detail:
          sim.result === null
            ? 'None'
            : sim.stale
              ? 'Out of date'
              : sim.showResults
                ? 'Shown'
                : 'Hidden',
        ...(sim.result === null
          ? { disabled: true, disabledReason: 'Solve the study first.' }
          : {}),
      },
    ],
  };
}

export function simulationActiveId(sim: SimulationHandle, browserOpen: boolean): string | null {
  return sim.tool ?? (browserOpen ? 'sim-browser' : null);
}

/** What a rail button does in the Simulation workspace. */
export function activateSimulation(
  id: string,
  sim: SimulationHandle,
  toggleBrowser: () => void,
): void {
  if ((TOOL_IDS as readonly string[]).includes(id)) {
    sim.setTool(sim.tool === id ? null : (id as SimTool));
    return;
  }
  if (id === 'sim-browser') toggleBrowser();
  else if (id === 'gravity')
    sim.setGravity(!sim.study.loads.some((load) => load.kind === 'gravity'));
  else if (id === 'solve') {
    if (sim.running) sim.cancel();
    else sim.solve();
  } else if (id === 'results') sim.setShowResults(!sim.showResults);
}
