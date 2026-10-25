/**
 * Study definition: material, supports and loads. Faces are stable-reference strings
 * (`F:extrude-1:end`), so a study survives rebuilds and re-meshing.
 */

export type Vec3 = readonly [number, number, number];
/** A stable face reference in its text form (`formatRef`). */
export type FaceKey = string;

export interface Material {
  id: string;
  name: string;
  /** Young's modulus, MPa. */
  youngsModulus: number;
  poissonRatio: number;
  /** t/mm³ (1 g/cm³ = 1e-9). */
  density: number;
  /** Yield strength (tensile, for polymers), MPa. Drives the safety factor. */
  yieldStrength: number;
  /** Thermal conductivity, W/(m·K), as datasheets list it. */
  conductivity: number;
  family: 'polymer' | 'metal';
}

/** Printed polymers are listed with in-plane values; Z is 30 to 50 % weaker. */
export const MATERIALS: readonly Material[] = [
  {
    id: 'pla',
    name: 'PLA (printed)',
    youngsModulus: 3500,
    poissonRatio: 0.36,
    density: 1.24e-9,
    yieldStrength: 50,
    conductivity: 0.13,
    family: 'polymer',
  },
  {
    id: 'petg',
    name: 'PETG (printed)',
    youngsModulus: 2100,
    poissonRatio: 0.38,
    density: 1.27e-9,
    yieldStrength: 50,
    conductivity: 0.2,
    family: 'polymer',
  },
  {
    id: 'abs',
    name: 'ABS (printed)',
    youngsModulus: 2200,
    poissonRatio: 0.35,
    density: 1.04e-9,
    yieldStrength: 40,
    conductivity: 0.17,
    family: 'polymer',
  },
  {
    id: 'pa12',
    name: 'Nylon PA12',
    youngsModulus: 1700,
    poissonRatio: 0.39,
    density: 1.01e-9,
    yieldStrength: 48,
    conductivity: 0.25,
    family: 'polymer',
  },
  {
    id: 'al6061',
    name: 'Aluminium 6061-T6',
    youngsModulus: 68900,
    poissonRatio: 0.33,
    density: 2.7e-9,
    yieldStrength: 276,
    conductivity: 167,
    family: 'metal',
  },
  {
    id: 's235',
    name: 'Steel S235',
    youngsModulus: 210000,
    poissonRatio: 0.3,
    density: 7.85e-9,
    yieldStrength: 235,
    conductivity: 50,
    family: 'metal',
  },
  {
    id: 'ss304',
    name: 'Stainless 304',
    youngsModulus: 193000,
    poissonRatio: 0.29,
    density: 8.0e-9,
    yieldStrength: 215,
    conductivity: 16.2,
    family: 'metal',
  },
  {
    id: 'ti64',
    name: 'Titanium Ti-6Al-4V',
    youngsModulus: 113800,
    poissonRatio: 0.34,
    density: 4.43e-9,
    yieldStrength: 880,
    conductivity: 6.7,
    family: 'metal',
  },
];

export type Constraint =
  | { id: string; kind: 'fixed'; faces: FaceKey[] }
  /** Only the chosen global axes are held. */
  | { id: string; kind: 'pin'; faces: FaceKey[]; axes: readonly [boolean, boolean, boolean] }
  /** Held along the face normal, free in its plane. */
  | { id: string; kind: 'frictionless'; faces: FaceKey[] };

export type ThermalCondition =
  /** The faces are held at this temperature, °C. */
  | { id: string; kind: 'temperature'; faces: FaceKey[]; temperature: number }
  /** Total heat in W entering through the faces, e.g. a heater. */
  | { id: string; kind: 'heat'; faces: FaceKey[]; power: number }
  /** Convection to air: film coefficient W/(m²·K), air temperature °C. */
  | { id: string; kind: 'convection'; faces: FaceKey[]; coefficient: number; ambient: number };

export type Load =
  /** A total force in N shared over the faces by area. */
  | { id: string; kind: 'force'; faces: FaceKey[]; magnitude: number; direction: Vec3 }
  /** MPa along the inward normal; positive pushes into the part. */
  | { id: string; kind: 'pressure'; faces: FaceKey[]; pressure: number }
  /** Body load; `acceleration` in mm/s² (standard gravity 9806.65). */
  | { id: string; kind: 'gravity'; direction: Vec3; acceleration: number };

export type StudyKind =
  | 'static'
  | 'shape-optimisation'
  | 'modal'
  | 'thermal'
  | 'thermal-stress'
  | 'buckling'
  | 'nonlinear-static'
  | 'event'
  | 'fatigue'
  | 'flow-preview';

export interface StudyKindInfo {
  id: StudyKind;
  label: string;
  summary: string;
  /** Solved in this build; the others are listed but refused. */
  available: boolean;
}

export const STUDY_KINDS: readonly StudyKindInfo[] = [
  {
    id: 'static',
    label: 'Static Stress',
    summary: 'Stress, displacement and safety factor under steady loads.',
    available: true,
  },
  {
    id: 'shape-optimisation',
    label: 'Shape Optimisation',
    summary: 'Remove material the loads do not need (SIMP).',
    available: true,
  },
  {
    id: 'modal',
    label: 'Modal Frequencies',
    summary: 'Natural frequencies and mode shapes.',
    available: false,
  },
  {
    id: 'thermal',
    label: 'Thermal',
    summary: 'Steady-state temperature and heat flux.',
    available: true,
  },
  {
    id: 'thermal-stress',
    label: 'Thermal Stress',
    summary: 'Stress from temperature change and loads together.',
    available: false,
  },
  {
    id: 'buckling',
    label: 'Structural Buckling',
    summary: 'Critical load factors and buckled shapes.',
    available: false,
  },
  {
    id: 'nonlinear-static',
    label: 'Nonlinear Static',
    summary: 'Large deflection, contact and plasticity.',
    available: false,
  },
  {
    id: 'event',
    label: 'Event Simulation',
    summary: 'Drops and impacts over time.',
    available: false,
  },
  {
    id: 'fatigue',
    label: 'Fatigue',
    summary: 'Life under repeated loading from S–N data.',
    available: false,
  },
  {
    id: 'flow-preview',
    label: 'Flow Preview',
    summary: 'Quick air-flow pressure on the surface.',
    available: false,
  },
];

export type MeshResolution = 'coarse' | 'medium' | 'fine' | 'ultra';

/** Target element count per resolution. The solve grows roughly linearly. */
export const RESOLUTION_ELEMENTS: Record<MeshResolution, number> = {
  coarse: 6_000,
  medium: 24_000,
  fine: 70_000,
  ultra: 160_000,
};

export interface OptimisationSettings {
  /** Fraction of the part's volume to keep, 0–1. */
  volumeFraction: number;
  penalty: number;
  /** Density filter radius in elements; sets the smallest member. */
  filterRadius: number;
  iterations: number;
}

export const DEFAULT_OPTIMISATION: OptimisationSettings = {
  volumeFraction: 0.35,
  penalty: 3,
  filterRadius: 1.5,
  iterations: 40,
};

export interface Study {
  id: string;
  name: string;
  kind: StudyKind;
  materialId: string;
  constraints: Constraint[];
  loads: Load[];
  /** What heats and cools the part, for a thermal study. */
  thermal: ThermalCondition[];
  resolution: MeshResolution;
  optimisation: OptimisationSettings;
}

export function materialOf(study: Pick<Study, 'materialId'>): Material {
  return (
    MATERIALS.find((material) => material.id === study.materialId) ?? (MATERIALS[0] as Material)
  );
}
