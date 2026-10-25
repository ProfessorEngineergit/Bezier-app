/**
 * Simulation workspace icons, following the `Icons.tsx` grid and rules. Support symbols follow
 * engineering drawing convention: hatched ground (fixed), triangle (pin), triangle on rollers
 * (sliding).
 */

import { FILL, GHOST, Glyph } from './Icons.js';

export const FixedIcon = () => (
  <Glyph>
    <path d="M3 9h10" />
    <path d="M4 12l2-3M7 12l2-3M10 12l2-3" opacity={GHOST} />
    <rect height="4" rx="1" width="6" x="5" y="3" fill="currentColor" opacity={FILL} />
  </Glyph>
);

export const PinIcon = () => (
  <Glyph>
    <circle cx="8" cy="5" r="1.6" />
    <path d="M8 6.6 4.6 11.5h6.8Z" />
    <path d="M3.5 13.5h9" opacity={GHOST} />
  </Glyph>
);

export const FrictionlessIcon = () => (
  <Glyph>
    <path d="M8 3.5 5 8.5h6Z" />
    <circle cx="6" cy="10.4" r="1.1" />
    <circle cx="10" cy="10.4" r="1.1" />
    <path d="M3.5 12.8h9" opacity={GHOST} />
  </Glyph>
);

export const ForceIcon = () => (
  <Glyph>
    <path d="M8 2.5v7" />
    <path d="M5.5 7.2 8 9.8l2.5-2.6" />
    <path d="M3 12.5h10" opacity={GHOST} />
  </Glyph>
);

export const PressureIcon = () => (
  <Glyph>
    <path d="M4 3v5M8 3v5M12 3v5" />
    <path d="M2.8 6.8 4 8.2l1.2-1.4M6.8 6.8 8 8.2l1.2-1.4M10.8 6.8 12 8.2l1.2-1.4" />
    <path d="M2.5 11.5h11" opacity={GHOST} />
  </Glyph>
);

export const GravityIcon = () => (
  <Glyph>
    <rect height="5" rx="1" width="7" x="4.5" y="2.5" fill="currentColor" opacity={FILL} />
    <rect height="5" rx="1" width="7" x="4.5" y="2.5" />
    <path d="M8 9v4.5M6.3 11.8 8 13.5l1.7-1.7" />
  </Glyph>
);

export const MaterialIcon = () => (
  <Glyph>
    <circle cx="8" cy="8" r="5.2" />
    <path d="M8 2.8a5.2 5.2 0 0 0 0 10.4" fill="currentColor" opacity={FILL} stroke="none" />
    <path d="M5.4 6.2a3 3 0 0 1 2-1.4" opacity={GHOST} />
  </Glyph>
);

export const MeshIcon = () => (
  <Glyph>
    <rect height="10" rx="1.2" width="10" x="3" y="3" />
    <path d="M3 6.4h10M3 9.6h10M6.4 3v10M9.6 3v10" opacity={GHOST} />
  </Glyph>
);

export const SolveIcon = () => (
  <Glyph>
    <circle cx="8" cy="8" r="5.6" />
    <path d="M6.8 5.6v4.8L10.6 8Z" fill="currentColor" />
  </Glyph>
);

export const StressIcon = () => (
  <Glyph>
    <path d="M3 13V3" opacity={GHOST} />
    <rect height="2.2" width="4" x="5" y="10.8" fill="currentColor" opacity={FILL} />
    <rect height="2.2" width="6" x="5" y="7.4" fill="currentColor" opacity={0.55} />
    <rect height="2.2" width="8" x="5" y="4" fill="currentColor" />
  </Glyph>
);

export const DisplacementIcon = () => (
  <Glyph>
    <rect height="7" rx="1" width="7" x="2.5" y="6.5" opacity={GHOST} strokeDasharray="1.5 1.3" />
    <rect height="7" rx="1" width="7" x="6.5" y="2.5" />
    <path d="M5 9l3-3" opacity={GHOST} />
  </Glyph>
);

export const SafetyIcon = () => (
  <Glyph>
    <path d="M8 2.4 13 4.4v3.8c0 3-2.2 4.8-5 5.6-2.8-.8-5-2.6-5-5.6V4.4Z" />
    <path d="m5.8 8.2 1.6 1.6 3-3.2" />
  </Glyph>
);

export const ProbeIcon = () => (
  <Glyph>
    <circle cx="7" cy="7" r="3.2" />
    <path d="M7 2v1.6M7 10.4V12M2 7h1.6M10.4 7H12" opacity={GHOST} />
    <path d="m9.4 9.4 4 4" />
  </Glyph>
);

export const StudyIcon = () => (
  <Glyph>
    <path d="M6 2.5h4M6.6 2.5v3.6L3.4 12a1 1 0 0 0 .9 1.5h7.4a1 1 0 0 0 .9-1.5L9.4 6.1V2.5" />
    <path d="M4.6 10h6.8" opacity={GHOST} />
  </Glyph>
);

export const OptimiseIcon = () => (
  <Glyph>
    <path d="M2.5 12.5h11M2.5 12.5 6 5.5M13.5 12.5 10 5.5M6 5.5h4M6 5.5 8 12.5M10 5.5 8 12.5" />
    <circle cx="6" cy="5.5" r="1" fill="currentColor" />
    <circle cx="10" cy="5.5" r="1" fill="currentColor" />
  </Glyph>
);

export const AnimateIcon = () => (
  <Glyph>
    <path d="M2 9c1.5-4 3-4 4.5 0s3 4 4.5 0 1.5-1.5 3-2" />
    <path d="M2 12.5h12" opacity={GHOST} />
  </Glyph>
);

export const DesignIcon = () => (
  <Glyph>
    <path d="M2.4 4.6 8 1.8l5.6 2.8L8 7.4Z" fill="currentColor" opacity={FILL} />
    <path d="M2.4 4.6 8 1.8l5.6 2.8L8 7.4Z" />
    <path d="M2.4 4.6v6.8L8 14.2V7.4M13.6 4.6v6.8L8 14.2" />
  </Glyph>
);

export const SimulationIcon = () => (
  <Glyph>
    <path d="M2.4 4.6 8 1.8l5.6 2.8L8 7.4Z" />
    <path d="M2.4 4.6v6.8L8 14.2V7.4M13.6 4.6v6.8L8 14.2" opacity={GHOST} />
    <path d="M10.4 9.4 12 11" />
    <path d="M5 8.2v3.2" />
    <path d="M10 10.6v2" />
  </Glyph>
);

/** A thermometer: a face held at a temperature. */
export const TemperatureIcon = () => (
  <Glyph>
    <path d="M6.6 9.4V3.8a1.4 1.4 0 0 1 2.8 0v5.6a2.6 2.6 0 1 1-2.8 0Z" />
    <circle cx="8" cy="11.4" r="1.2" fill="currentColor" stroke="none" />
    <path d="M11 4.5h2M11 7h1.4" opacity={GHOST} />
  </Glyph>
);

/** Heat going in through a face: three rising waves over a surface. */
export const HeatIcon = () => (
  <Glyph>
    <path d="M5 9.5c-1-1.4 1-2.4 0-3.8s1-2.4 0-3.2M8 9.5c-1-1.4 1-2.4 0-3.8s1-2.4 0-3.2M11 9.5c-1-1.4 1-2.4 0-3.8s1-2.4 0-3.2" />
    <path d="M2.5 12.5h11" opacity={GHOST} />
  </Glyph>
);

/** Air carrying heat away from a face: a surface with flowing lines along it. */
export const ConvectionIcon = () => (
  <Glyph>
    <path d="M2.5 12.5h11" opacity={GHOST} />
    <path d="M3 9.2c2-1.4 3.4 1.4 5 0s3-1.4 5 0M3 5.6c2-1.4 3.4 1.4 5 0s3-1.4 5 0" />
  </Glyph>
);

/** A temperature map: the result of a thermal study. */
export const TemperatureMapIcon = () => (
  <Glyph>
    <rect height="10" rx="1.5" width="10" x="3" y="3" fill="currentColor" opacity={FILL} />
    <rect height="10" rx="1.5" width="10" x="3" y="3" />
    <path d="M5.5 10.5c1.5-3 3.5-3 5-5" opacity={GHOST} />
  </Glyph>
);
