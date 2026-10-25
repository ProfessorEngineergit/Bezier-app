export { elasticity, HEX_NODES, hex8Stiffness, strainMatrix } from './hex8.js';
export {
  type Constraint,
  DEFAULT_OPTIMISATION,
  type FaceKey,
  type Load,
  MATERIALS,
  type Material,
  type MeshResolution,
  materialOf,
  type OptimisationSettings,
  RESOLUTION_ELEMENTS,
  STUDY_KINDS,
  type Study,
  type StudyKind,
  type StudyKindInfo,
  type ThermalCondition,
  type Vec3,
} from './model.js';
export {
  elementStress,
  nodalAverage,
  type StaticFields,
  type StaticSummary,
  sampleField,
  staticFields,
  vonMisesOf,
} from './results.js';
export { nonDesign, type OptimisationResult, type OptimisationStep, optimise } from './simp.js';
export {
  applyStiffness,
  type GridSystem,
  gridSystem,
  type Placement,
  place,
  type SolveOptions,
  type SolveResult,
  sideNodes,
  sideNormal,
  solveStatic,
} from './solve.js';
export {
  hex8Conduction,
  placeThermal,
  solveThermal,
  type ThermalPlacement,
  type ThermalSolve,
  type ThermalSummary,
  thermalFields,
} from './thermal.js';
export { type SurfaceMesh, type VoxelGrid, voxelIndex, voxelise } from './voxel.js';
