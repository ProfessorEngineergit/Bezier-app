/// <reference lib="webworker" />
/**
 * Solver worker for the Simulation workspace. Meshing, solving and recovery run here so the window
 * keeps drawing at full rate and the part can be orbited while a study runs.
 */

import {
  gridSystem,
  materialOf,
  nodalAverage,
  optimise,
  place,
  placeThermal,
  RESOLUTION_ELEMENTS,
  sampleField,
  solveStatic,
  solveThermal,
  staticFields,
  thermalFields,
  voxelise,
} from '@bezier/sim';
import {
  type ResultFields,
  SAFETY_CAP,
  type SimulationResult,
  type SolveRequest,
  transferablesOf,
  type WorkerMessage,
} from './sim-protocol.js';

const scope = self as unknown as DedicatedWorkerGlobalScope;

function post(message: WorkerMessage, transfer: ArrayBuffer[] = []): void {
  scope.postMessage(message, transfer);
}

scope.onmessage = (event: MessageEvent<SolveRequest>) => {
  const request = event.data;
  try {
    run(request);
  } catch (error) {
    post({
      kind: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
      issues: [],
    });
  }
};

function run(request: SolveRequest): void {
  const { id, study, surface } = request;
  const started = performance.now();
  const material = materialOf(study);

  post({ kind: 'progress', id, stage: 'mesh', fraction: 0.02, detail: 'Meshing' });
  const grid = voxelise(surface, RESOLUTION_ELEMENTS[study.resolution]);
  if (grid.solidCount === 0) {
    post({
      kind: 'error',
      id,
      message: 'The part could not be meshed.',
      issues: ['It may not be a closed solid.'],
    });
    return;
  }
  const system = gridSystem(grid);
  if (study.kind === 'thermal') {
    runThermal(request, system, started);
    return;
  }
  const placement = place(system, study, material, new Map(request.faceIndex));
  const blocking = placement.issues.filter((issue) => issue.startsWith('Add a'));
  if (blocking.length > 0) {
    post({ kind: 'error', id, message: 'The study is not ready to solve.', issues: blocking });
    return;
  }
  const warnings = placement.issues.filter((issue) => !issue.startsWith('Add a'));
  const positions = surface.positions;
  const vertexCount = positions.length / 3;

  if (study.kind === 'shape-optimisation') {
    let last = { compliance: 0, volumeFraction: 1, iteration: 0 };
    const outcome = optimise(system, material, placement, study.optimisation, (step, density) => {
      last = step;
      const perVertex = sampleField(system, nodalAverage(system, density), positions, 1);
      post({
        kind: 'progress',
        id,
        stage: 'optimise',
        fraction: Math.min(0.98, (step.iteration + 1) / study.optimisation.iterations),
        detail: `Iteration ${step.iteration + 1} · ${Math.round(step.volumeFraction * 100)} % volume`,
      });
      post(
        {
          kind: 'optimise-step',
          id,
          iteration: step.iteration,
          volumeFraction: step.volumeFraction,
          density: perVertex,
        },
        [perVertex.buffer as ArrayBuffer],
      );
    });
    const density = sampleField(system, nodalAverage(system, outcome.density), positions, 1);
    const empty = () => new Float32Array(vertexCount);
    const fields: ResultFields = {
      vonMises: empty(),
      displacement: empty(),
      vector: new Float32Array(vertexCount * 3),
      safety: empty(),
      density,
      temperature: null,
      flux: null,
    };
    const result: SimulationResult = {
      studyKind: study.kind,
      elements: grid.solidCount,
      h: grid.h,
      iterations: outcome.history.length,
      converged: true,
      seconds: (performance.now() - started) / 1000,
      fields,
      summary: {
        maxVonMises: 0,
        maxDisplacement: 0,
        minSafetyFactor: Infinity,
        appliedForce: [0, 0, 0],
        volumeFraction: last.volumeFraction,
        compliance: last.compliance,
      },
      warnings,
    };
    post({ kind: 'result', id, result }, transferablesOf(fields));
    return;
  }

  const solved = solveStatic(system, material, placement, {
    tolerance: 1e-5,
    onProgress: (iteration, residual) => {
      const fraction = 0.1 + 0.85 * Math.min(1, -Math.log10(Math.max(residual, 1e-12)) / 5);
      post({
        kind: 'progress',
        id,
        stage: 'solve',
        fraction,
        detail: `Solving · iteration ${iteration}`,
      });
    },
  });
  if (!solved.converged && solved.relativeResidual > 1e-2) {
    post({
      kind: 'error',
      id,
      message: 'The solve did not settle.',
      issues: [
        'Part of the model is free to move. Fix a face, or pin more directions, so every piece is held.',
      ],
    });
    return;
  }
  if (!solved.converged)
    warnings.push('The solve stopped short of full accuracy; values are close but not final.');

  post({ kind: 'progress', id, stage: 'recover', fraction: 0.97, detail: 'Recovering stress' });
  const fields = staticFields(system, material, solved.displacement, placement.force);
  const nodal = new Float32Array(solved.displacement.length);
  for (let d = 0; d < nodal.length; d++) nodal[d] = solved.displacement[d] as number;
  const vonMises = sampleField(system, fields.nodalVonMises, positions, 1);
  const vector = sampleField(system, nodal, positions, 3);
  const displacement = new Float32Array(vertexCount);
  const safety = new Float32Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    displacement[v] = Math.hypot(
      vector[v * 3] as number,
      vector[v * 3 + 1] as number,
      vector[v * 3 + 2] as number,
    );
    const stress = vonMises[v] as number;
    safety[v] = stress > 0 ? Math.min(SAFETY_CAP, material.yieldStrength / stress) : SAFETY_CAP;
  }
  const result: SimulationResult = {
    studyKind: study.kind,
    elements: grid.solidCount,
    h: grid.h,
    iterations: solved.iterations,
    converged: solved.converged,
    seconds: (performance.now() - started) / 1000,
    fields: {
      vonMises,
      displacement,
      vector,
      safety,
      density: null,
      temperature: null,
      flux: null,
    },
    summary: fields.summary,
    warnings,
  };
  post({ kind: 'result', id, result }, transferablesOf(result.fields));
}

/** Thermal study: same grid, one temperature per node, then temperature and flux on the model. */
function runThermal(
  request: SolveRequest,
  system: ReturnType<typeof gridSystem>,
  started: number,
): void {
  const { id, study, surface } = request;
  const material = materialOf(study);
  const conditions = study.thermal ?? [];
  const placement = placeThermal(system, conditions, new Map(request.faceIndex));
  const blocking = placement.issues.filter((issue) => issue.startsWith('Add a'));
  if (blocking.length > 0) {
    post({ kind: 'error', id, message: 'The study is not ready to solve.', issues: blocking });
    return;
  }
  const warnings = placement.issues.filter((issue) => !issue.startsWith('Add a'));
  const solved = solveThermal(system, material, placement, {
    onProgress: (iteration, residual) => {
      const fraction = 0.1 + 0.85 * Math.min(1, -Math.log10(Math.max(residual, 1e-12)) / 8);
      post({
        kind: 'progress',
        id,
        stage: 'solve',
        fraction,
        detail: `Solving · iteration ${iteration}`,
      });
    },
  });
  if (!solved.converged && solved.relativeResidual > 1e-3) {
    post({
      kind: 'error',
      id,
      message: 'The solve did not settle.',
      issues: [
        'Part of the model has no path for its heat. Hold a face at a temperature, or add air to it.',
      ],
    });
    return;
  }
  if (!solved.converged)
    warnings.push('The solve stopped short of full accuracy; values are close but not final.');
  post({ kind: 'progress', id, stage: 'recover', fraction: 0.97, detail: 'Recovering heat flux' });
  const fields = thermalFields(system, material, solved.temperature, conditions);
  const nodal = new Float32Array(solved.temperature.length);
  for (let n = 0; n < nodal.length; n++) nodal[n] = solved.temperature[n] as number;
  const positions = surface.positions;
  const vertexCount = positions.length / 3;
  const temperature = sampleField(system, nodal, positions, 1);
  const flux = sampleField(system, nodalAverage(system, fields.flux), positions, 1);
  const empty = () => new Float32Array(vertexCount);
  const result: SimulationResult = {
    studyKind: study.kind,
    elements: system.grid.solidCount,
    h: system.grid.h,
    iterations: solved.iterations,
    converged: solved.converged,
    seconds: (performance.now() - started) / 1000,
    fields: {
      vonMises: empty(),
      displacement: empty(),
      vector: new Float32Array(vertexCount * 3),
      safety: empty(),
      density: null,
      temperature,
      flux,
    },
    summary: {
      maxVonMises: 0,
      maxDisplacement: 0,
      minSafetyFactor: Infinity,
      appliedForce: [0, 0, 0],
      ...fields.summary,
    },
    warnings,
  };
  post({ kind: 'result', id, result }, transferablesOf(result.fields));
}
