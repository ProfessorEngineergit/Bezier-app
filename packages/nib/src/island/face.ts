/**
 * Nib's flat 2D face for the island circle: black visor, ringed eyes and white brows. A drawing
 * rather than the model, which is an unreadable smudge at 32 px and would render every frame.
 * Moods are part positions converted to transforms here and animated by CSS transitions; only
 * transforms, because WebKit (the Mac app) does not animate SVG path shapes.
 */

import type { Mood } from './machine.js';

export interface Face {
  /** Upper lid coverage, 0 open to 1 shut. */
  top: number;
  /** Lower lid coverage, for smiling eyes. */
  bottom: number;
  /** Gaze, -1 to 1 on each axis, `y` down. */
  gazeX: number;
  gazeY: number;
  /** Eye scale: wider (oops) or narrower. */
  size: number;
  /** Brow height in drawing units, positive up. */
  brow: number;
  /**
   * Brow angle in degrees: positive raises the inner ends (worry), negative lowers them (focus).
   */
  tilt: number;
  /** Extra raise of the right brow, for a question. */
  askew: number;
  /** Cheeks pushed up under the eyes, for a smile. */
  cheek: number;
}

const base: Face = {
  top: 0.08,
  bottom: 0,
  gazeX: 0,
  gazeY: 0,
  size: 1,
  brow: 0,
  tilt: 0,
  askew: 0,
  cheek: 0,
};

export const FACES: Readonly<Record<Mood, Face>> = {
  rest: base,
  sleepy: { ...base, top: 0.62, bottom: 0.06, gazeY: 0.35, brow: -0.6 },
  focused: { ...base, top: 0.22, bottom: 0.1, gazeX: 0.35, gazeY: -0.55, brow: -0.7, tilt: -7 },
  thinking: { ...base, top: 0.16, gazeX: 0.65, gazeY: -0.7, askew: 1.1 },
  curious: { ...base, top: 0, gazeY: 0.15, size: 1.05, brow: 1 },
  happy: { ...base, top: 0, bottom: 0.48, brow: 0.8, cheek: 1.4 },
  proud: { ...base, top: 0.14, bottom: 0.42, gazeY: -0.2, brow: 1, cheek: 1.4 },
  worried: { ...base, top: 0.12, gazeY: 0.3, brow: 0.5, tilt: 12 },
  oops: { ...base, top: 0, size: 1.12, brow: 1.8, tilt: 8 },
  // Heavy lids, eyes down, brows raised in the middle: straining.
  strained: { ...base, top: 0.38, bottom: 0.08, gazeY: 0.45, brow: 0.9, tilt: 14, size: 0.96 },
};

/** Part geometry in the face's 40-unit square. */
export const LAYOUT = {
  size: 40,
  visor: { x: 5, y: 11, width: 30, height: 19, radius: 7.5 },
  eyes: [14, 26] as const,
  eyeY: 20.5,
  /** The silver ring and the dark lens inside it. */
  ring: 4.7,
  lens: 3.3,
  /** Maximum lens offset inside the ring at full gaze. */
  travel: 1.1,
  browY: 13.6,
  cheekY: 27.4,
} as const;

/** CSS `transform` values for each moving part of a face. */
export interface FaceTransforms {
  eyes: string;
  lens: string;
  top: string;
  bottom: string;
  browLeft: string;
  browRight: string;
  cheeks: string;
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

export function faceTransforms(face: Face): FaceTransforms {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const gx = Math.max(-1, Math.min(1, face.gazeX));
  const gy = Math.max(-1, Math.min(1, face.gazeY));
  // Lids never fully meet while awake; that reads as a blink.
  const top = clamp(face.top);
  const bottom = Math.min(clamp(face.bottom), 1 - top);
  // Each brow rotates about its own centre; the left brow's inner end is its right end.
  const browLift = round(-face.brow);
  return {
    eyes: `scale(${round(face.size)})`,
    lens: `translate(${round(gx * LAYOUT.travel)}px, ${round(gy * LAYOUT.travel)}px)`,
    top: `scaleY(${round(top)})`,
    bottom: `scaleY(${round(bottom)})`,
    browLeft: `translateY(${browLift}px) rotate(${round(-face.tilt)}deg)`,
    browRight: `translateY(${round(browLift - face.askew)}px) rotate(${round(face.tilt)}deg)`,
    cheeks: `translateY(${round(-face.cheek)}px)`,
  };
}

/** The same face with a different gaze (the occasional glance at rest); keeps the mood. */
export function glancing(face: Face, gazeX: number, gazeY: number): Face {
  return { ...face, gazeX, gazeY };
}
