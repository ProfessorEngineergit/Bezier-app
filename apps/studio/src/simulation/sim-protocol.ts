/**
 * Messages between the Simulation workspace and its worker. Typed arrays are transferred, not
 * copied: a fine-mesh result is tens of megabytes, and structured cloning would cost more than the
 * rest of the round trip.
 */

import type { Study } from '@bezier/sim';

export interface SurfaceArrays {
  positions: Float32Array;
  indices: Uint32Array;
  triangleFaces: Uint32Array;
}

export interface SolveRequest {
  kind: 'solve';
  id: number;
  study: Study;
  surface: SurfaceArrays;
  /** Stable-reference text → display face index, as the viewport has it. */
  faceIndex: readonly (readonly [string, number])[];
}

export interface ResultFields {
  /** Per display vertex, MPa. */
  vonMises: Float32Array;
  /** Per display vertex, mm. */
  displacement: Float32Array;
  /** Per display vertex, xyz mm: what the deformation animation moves by. */
  vector: Float32Array;
  /** Per display vertex, yield ÷ von Mises, capped. */
  safety: Float32Array;
  /** Per display vertex, 0 to 1. Only for shape optimisation. */
  density: Float32Array | null;
  /** Per display vertex, °C. Only for a thermal study. */
  temperature: Float32Array | null;
  /** Per display vertex, heat flux through the material, W/m². Only for a thermal study. */
  flux: Float32Array | null;
}

export interface SolveSummary {
  maxVonMises: number;
  maxDisplacement: number;
  minSafetyFactor: number;
  appliedForce: [number, number, number];
  /** Shape optimisation: volume kept, and stiffness gained per unit volume. */
  volumeFraction?: number;
  compliance?: number;
  /** Thermal: the range the part settles in, °C, the largest flux, W/m², and the heat put in, W. */
  minTemperature?: number;
  maxTemperature?: number;
  maxFlux?: number;
  heatIn?: number;
}

export interface SimulationResult {
  studyKind: Study['kind'];
  elements: number;
  /** Voxel edge, mm. */
  h: number;
  iterations: number;
  converged: boolean;
  seconds: number;
  fields: ResultFields;
  summary: SolveSummary;
  /** Things the user should know that did not stop the solve. */
  warnings: string[];
}

export type WorkerMessage =
  | {
      kind: 'progress';
      id: number;
      stage: 'mesh' | 'solve' | 'optimise' | 'recover';
      fraction: number;
      detail: string;
    }
  | {
      kind: 'optimise-step';
      id: number;
      iteration: number;
      volumeFraction: number;
      density: Float32Array;
    }
  | { kind: 'result'; id: number; result: SimulationResult }
  | { kind: 'error'; id: number; message: string; issues: string[] };

/** Every transferable buffer in a result, for `postMessage`'s transfer list. */
export function transferablesOf(fields: ResultFields): ArrayBuffer[] {
  const buffers = [
    fields.vonMises,
    fields.displacement,
    fields.vector,
    fields.safety,
    fields.density,
    fields.temperature,
    fields.flux,
  ]
    .filter((array): array is Float32Array => array !== null)
    .map((array) => array.buffer as ArrayBuffer);
  return [...new Set(buffers)];
}

/** Above this, safety factor no longer changes the picture. */
export const SAFETY_CAP = 15;
