//! Study definition: material, constraints and loads.
//!
//! Constraints and loads reference B-Rep faces by stable reference (e.g. `F:extrude-1:end`), so a
//! study survives re-meshing and most parameter edits.

/// A stable face reference, as persisted by `@bezier/core` (`formatRef`).
pub type FaceRef = String;

/// Linear-elastic, isotropic material in mm–N–MPa–t units.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Material {
    /// Young's modulus, MPa.
    pub youngs_modulus: f64,
    pub poisson_ratio: f64,
    /// Density, t/mm³ (1 g/cm³ = 1e-9 t/mm³).
    pub density: f64,
    /// Yield (for polymers, tensile) strength, MPa. Used for the safety factor.
    pub yield_strength: f64,
    /// W/(mm·K).
    pub thermal_conductivity: f64,
    /// 1/K.
    pub thermal_expansion: f64,
}

impl Material {
    /// Printed PLA, in-plane values. Printed parts are 30–50 % weaker in Z, which
    /// this isotropic model does not capture.
    pub const PLA: Material = Material {
        youngs_modulus: 3_500.0,
        poisson_ratio: 0.36,
        density: 1.24e-9,
        yield_strength: 50.0,
        thermal_conductivity: 1.3e-4,
        thermal_expansion: 68e-6,
    };
    pub const PETG: Material = Material {
        youngs_modulus: 2_100.0,
        poisson_ratio: 0.38,
        density: 1.27e-9,
        yield_strength: 50.0,
        thermal_conductivity: 2.0e-4,
        thermal_expansion: 60e-6,
    };
    pub const ALUMINIUM_6061_T6: Material = Material {
        youngs_modulus: 68_900.0,
        poisson_ratio: 0.33,
        density: 2.70e-9,
        yield_strength: 276.0,
        thermal_conductivity: 0.167,
        thermal_expansion: 23.6e-6,
    };
    pub const STEEL_S235: Material = Material {
        youngs_modulus: 210_000.0,
        poisson_ratio: 0.30,
        density: 7.85e-9,
        yield_strength: 235.0,
        thermal_conductivity: 0.050,
        thermal_expansion: 12e-6,
    };

    /// Lamé parameters (λ, μ).
    pub fn lame(&self) -> (f64, f64) {
        let (e, nu) = (self.youngs_modulus, self.poisson_ratio);
        let lambda = e * nu / ((1.0 + nu) * (1.0 - 2.0 * nu));
        let mu = e / (2.0 * (1.0 + nu));
        (lambda, mu)
    }
}

/// How faces are held.
#[derive(Clone, Debug, PartialEq)]
pub enum Constraint {
    /// Every translation fixed.
    Fixed { faces: Vec<FaceRef> },
    /// Only the chosen global axes fixed.
    Pin { faces: Vec<FaceRef>, axes: [bool; 3] },
    /// Free in the face's plane, held along its normal. Exact on planar faces;
    /// on curved faces applied per node along the local normal and reported as
    /// approximate.
    Frictionless { faces: Vec<FaceRef> },
}

/// What pushes on the part.
#[derive(Clone, Debug, PartialEq)]
pub enum Load {
    /// A total force in N, shared over the faces in proportion to area.
    Force { faces: Vec<FaceRef>, total: [f64; 3] },
    /// Pressure in MPa along the inward normal. Positive pushes into the part.
    Pressure { faces: Vec<FaceRef>, pressure: f64 },
    /// Body acceleration in mm/s² (standard gravity: `[0, 0, -9_806.65]`).
    Gravity { acceleration: [f64; 3] },
}

/// Settings for SIMP topology optimisation.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SimpSettings {
    /// Fraction of the design space's volume the result may keep, 0–1.
    pub volume_fraction: f64,
    /// Penalisation exponent; 3 is standard.
    pub penalty: f64,
    /// Density filter radius, in elements. Suppresses checkerboarding and sets
    /// the minimum member size (for printing, the nozzle-limited wall).
    pub filter_radius: f64,
    pub max_iterations: u32,
}

impl Default for SimpSettings {
    fn default() -> Self {
        SimpSettings { volume_fraction: 0.4, penalty: 3.0, filter_radius: 1.5, max_iterations: 60 }
    }
}

/// The kinds of study the workspace offers.
///
/// Covers the usual structural and thermal study types plus two previews. [`StudyKind::availability`]
/// reports which are solved; the rest are refused with a reason rather than
/// approximated.
#[derive(Clone, Debug, PartialEq)]
pub enum StudyKind {
    LinearStatic,
    NonlinearStatic,
    Modal { modes: u32 },
    Thermal,
    ThermalStress,
    Buckling { modes: u32 },
    /// Explicit dynamics over a time span, e.g. a drop test.
    Event { duration: f64 },
    /// High-cycle fatigue from a linear static result and an S–N curve.
    Fatigue { cycles: f64 },
    TopologyOptimisation(SimpSettings),
    /// Voxel-grid approximation while the user is still placing loads.
    RealtimePreview,
    /// One-way fluid → structure: a coarse flow field loading the surface.
    FluidStructurePreview,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Availability {
    Solved,
    /// Planned, with the phase in docs/simulation/ARCHITECTURE.md.
    Planned(u8),
}

impl StudyKind {
    pub fn availability(&self) -> Availability {
        match self {
            StudyKind::LinearStatic | StudyKind::TopologyOptimisation(_) => Availability::Solved,
            StudyKind::RealtimePreview | StudyKind::Modal { .. } | StudyKind::Fatigue { .. } => {
                Availability::Planned(2)
            }
            StudyKind::Thermal | StudyKind::ThermalStress | StudyKind::Buckling { .. } => {
                Availability::Planned(3)
            }
            StudyKind::NonlinearStatic
            | StudyKind::Event { .. }
            | StudyKind::FluidStructurePreview => Availability::Planned(4),
        }
    }
}

/// A complete study definition, as the workspace persists it.
#[derive(Clone, Debug, PartialEq)]
pub struct Study {
    pub kind: StudyKind,
    pub material: Material,
    pub constraints: Vec<Constraint>,
    pub loads: Vec<Load>,
}
