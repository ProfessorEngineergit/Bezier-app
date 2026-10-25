/**
 * Click reactions as data. A reaction is a list of timed steps setting channel targets (values, or
 * functions of time for waves and wobbles); springs move between steps. Hops are the exception: a
 * parabola written directly to his height, so landings are hard. Degrees, metres and seconds.
 * Reactions are written for his right side or both; `reactions.ts` mirrors and varies them.
 */

import type { Channel } from './channels.js';

export type Drive = number | ((since: number) => number);
export type Step = readonly [number, Readonly<Partial<Record<Channel, Drive>>>];

export type ReactionName =
  | 'juhu'
  | 'hop'
  | 'wave'
  | 'nod'
  | 'no'
  | 'tilt'
  | 'giggle'
  | 'spin'
  | 'surprise'
  | 'dizzy'
  | 'squish'
  | 'beep'
  | 'pen'
  | 'blinkhard'
  | 'wink'
  | 'wake'
  | 'shy'
  | 'think'
  | 'shrug'
  | 'stomp'
  | 'dance'
  | 'clap'
  | 'highfive'
  | 'cheer'
  | 'salute'
  | 'yawn'
  | 'oops';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (x: number): number => x * x * (3 - 2 * x);
export const wobble =
  (amount: number, hertz: number, from = 0) =>
  (u: number) =>
    amount * Math.sin((u - from) * hertz * Math.PI * 2);
/** A decaying oscillation: a nod or shake, not a tremor. */
const fading = (amount: number, hertz: number, rate: number) => (u: number) =>
  amount * Math.sin(u * hertz * Math.PI * 2) * Math.exp(-u * rate);
/** A jump of `height` metres starting at `from` and lasting `length` seconds. */
export const arc = (from: number, length: number, height: number) => (u: number) =>
  u >= from && u <= from + length
    ? height * 4 * ((u - from) / length) * (1 - (u - from) / length)
    : 0;

const happy = { smile: 1.5, cheek: 0.55, mouthWidth: 1.2 } as const;

export const REACTIONS: Readonly<Record<ReactionName, readonly Step[]>> = {
  // A hop with both arms up, for the film's "Juhu".
  juhu: [
    [0, { legLExt: -0.008, legRExt: -0.008, bodyPitch: 6, armLFwd: 4, armRFwd: 4, smile: 1.5 }],
    [
      0.14,
      {
        legLExt: 0.012,
        legRExt: 0.012,
        bodyPitch: -3,
        armLFwd: 25,
        armRFwd: 25,
        armLOut: 125,
        armROut: 125,
        armLBend: 8,
        armRBend: 8,
        neckNod: -8,
        lidClose: 0.3,
        ...happy,
      },
    ],
    [
      0.5,
      {
        legLExt: -0.004,
        legRExt: -0.004,
        bodyPitch: 3,
        armLFwd: 20,
        armRFwd: 20,
        armLOut: 80,
        armROut: 80,
        ...happy,
      },
    ],
    [
      0.62,
      {
        legLExt: 0.004,
        legRExt: 0.004,
        armLFwd: 20,
        armRFwd: 20,
        armLOut: 105,
        armROut: 105,
        ...happy,
      },
    ],
    [0.95, { smile: 1.3, cheek: 0.4 }],
  ],
  hop: [
    [0, { legLExt: -0.007, legRExt: -0.007, bodyPitch: 5 }],
    [0.12, { legLExt: 0.01, legRExt: 0.01, bodyPitch: -2, smile: 1.2 }],
    [0.55, { smile: 1 }],
  ],
  wave: [
    [0, { armRFwd: 15, armROut: 85, armRBend: 70, smile: 1.3, neckTilt: 5, cheek: 0.6 }],
    [
      0.25,
      {
        armRFwd: 15,
        armROut: 95,
        armRBend: 70,
        armRBendOut: wobble(28, 1.75, 0.25),
        smile: 1.4,
        neckTilt: 6,
        cheek: 0.8,
      },
    ],
    [1.35, { armROut: 40, armRBend: 40 }],
  ],
  nod: [
    [0, { neckNod: fading(14, 2.1, 1.3), smile: 1.2, cheek: 0.5 }],
    [1.1, {}],
  ],
  no: [
    [0, { neckTurn: fading(22, 2.4, 1), bodyTwist: fading(5, 2.4, 1), smile: 0.3, lidClose: 0.2 }],
    [1.2, {}],
  ],
  tilt: [
    [0, { neckTilt: 14, neckNod: -3, lidTilt: -9, smile: 0.6, mouthWidth: 0.7, lidClose: 0.02 }],
    [1.3, { neckTilt: 12, lidTilt: -9, smile: 0.6, mouthWidth: 0.7 }],
    [1.8, {}],
  ],
  giggle: [
    [
      0,
      {
        bodyRoll: wobble(3, 4.5),
        armLBend: (u) => 14 + 8 * Math.sin(u * 26),
        armRBend: (u) => 14 + 8 * Math.sin(u * 26 + 1),
        cheek: 1,
        smile: 1.6,
        lidClose: 0.45,
        neckTilt: 6,
      },
    ],
    [0.9, {}],
  ],
  spin: [
    [
      0,
      { yaw: (u) => 360 * smooth(clamp01((u - 0.05) / 0.7)), smile: 1.3, armLOut: 50, armROut: 50 },
    ],
    [0.85, { yaw: 360 }],
  ],
  surprise: [
    [
      0,
      {
        lidClose: -0.25,
        mouthWidth: 0.45,
        mouthThick: 1.7,
        smile: 0,
        bodyPitch: -7,
        neckNod: -6,
        armLOut: 30,
        armROut: 30,
        armLFwd: 30,
        armRFwd: 30,
      },
    ],
    [0.9, { lidClose: -0.1, mouthWidth: 0.5, mouthThick: 1.5, smile: 0, bodyPitch: -3 }],
    [1.4, {}],
  ],
  dizzy: [
    [
      0,
      {
        neckTilt: wobble(14, 1.43),
        neckTurn: (u) => 12 * Math.cos(u * 9),
        lidClose: 0.5,
        lidTilt: 10,
        smile: -0.6,
        mouthWidth: 0.8,
        bodyRoll: wobble(3, 1.43),
      },
    ],
    [1.8, {}],
  ],
  squish: [
    [
      0,
      {
        bodyZ: -0.004,
        bodyPitch: 5,
        lidClose: 0.8,
        smile: 1.4,
        legLExt: -0.006,
        legRExt: -0.006,
        glow: 1.6,
      },
    ],
    [0.18, { glow: 2 }],
    [0.5, {}],
  ],
  beep: [
    [0, { neckTilt: 9, glow: 2.2, smile: 1.1, lidClose: 0.2 }],
    [0.35, { neckTilt: 6, glow: 1.5 }],
    [0.8, {}],
  ],
  pen: [
    [0, { armRFwd: 60, armROut: 62, armRBend: 95, neckTilt: -6, smile: 1.1 }],
    [0.7, { armRFwd: 65, armROut: 62, armRBend: 100, armRBendOut: wobble(10, 3.2) }],
    [1.3, {}],
  ],
  blinkhard: [
    [0, { lidClose: 1, neckNod: 4 }],
    [0.18, { lidClose: 0.05, smile: 1.3, cheek: 0.7 }],
    [0.6, {}],
  ],
  wink: [
    [0, { lidCloseL: 1, smile: 1.5, cheek: 0.3, neckTilt: 9, mouthWidth: 1.2 }],
    [0.5, { lidCloseL: 0, smile: 1.5, neckTilt: 8, mouthWidth: 1.2 }],
    [1, {}],
  ],
  wake: [
    [0, { lidClose: -0.2, bodyPitch: -4, neckNod: -6, mouthWidth: 0.5, mouthThick: 1.5, smile: 0 }],
    [0.5, { smile: 1.2 }],
    [0.9, {}],
  ],
  shy: [
    [
      0,
      {
        neckTilt: 12,
        neckNod: 10,
        lidClose: 0.4,
        smile: 1.1,
        cheek: 0.8,
        armLFwd: 40,
        armRFwd: 40,
        armLOut: 22,
        armROut: 22,
        armLBend: 75,
        armRBend: 75,
        bodyRoll: 3,
      },
    ],
    [
      1.1,
      {
        neckTilt: 14,
        neckNod: 12,
        lidClose: 0.5,
        smile: 1.2,
        cheek: 0.9,
        armLFwd: 40,
        armRFwd: 40,
        armLBend: 75,
        armRBend: 75,
        bodyRoll: 3,
      },
    ],
    [1.7, {}],
  ],
  think: [
    [
      0,
      {
        neckTilt: 10,
        neckNod: -4,
        lidClose: 0.22,
        lidTilt: -8,
        smile: 0.4,
        mouthWidth: 0.6,
        armRFwd: 55,
        armROut: 25,
        armRBend: 105,
      },
    ],
    [
      1.3,
      {
        neckTilt: 10,
        neckTurn: 8,
        lidClose: 0.2,
        lidTilt: -8,
        smile: 0.4,
        mouthWidth: 0.6,
        armRFwd: 55,
        armROut: 25,
        armRBend: 105,
      },
    ],
    [1.9, {}],
  ],
  shrug: [
    [
      0,
      {
        armLOut: 38,
        armROut: 38,
        armLBend: 40,
        armRBend: 40,
        armLFwd: 10,
        armRFwd: 10,
        neckNod: 5,
        lidTilt: 8,
        smile: 0.3,
        mouthWidth: 0.8,
        bodyPitch: -2,
      },
    ],
    [
      0.9,
      { armLOut: 36, armROut: 36, armLBend: 40, armRBend: 40, neckNod: 5, lidTilt: 8, smile: 0.3 },
    ],
    [1.3, {}],
  ],
  stomp: [
    [0, { legLExt: 0.009, bodyRoll: -2.5, smile: 0.7, lidClose: 0.25, lidTilt: -10 }],
    [0.16, { legLExt: -0.004 }],
    [0.32, { legRExt: 0.009, bodyRoll: 2.5 }],
    [0.48, { legRExt: -0.004 }],
    [0.9, {}],
  ],
  dance: [
    [
      0,
      {
        bodyRoll: wobble(4, 1.1),
        neckTilt: wobble(9, 1.1, 0.1),
        legLExt: wobble(0.006, 1.1),
        legRExt: wobble(-0.006, 1.1),
        armLOut: (u) => 48 + 16 * Math.sin(u * 6.9),
        armROut: (u) => 48 - 16 * Math.sin(u * 6.9),
        bodyZ: wobble(0.0015, 2.2),
        ...happy,
      },
    ],
    [2.2, {}],
  ],
  clap: [
    [
      0,
      {
        armLFwd: 70,
        armRFwd: 70,
        armLBend: 60,
        armRBend: 60,
        armLOut: (u) => 14 + 12 * Math.sin(u * 28),
        armROut: (u) => 14 + 12 * Math.sin(u * 28),
        smile: 1.5,
        cheek: 0.6,
      },
    ],
    [1, {}],
  ],
  highfive: [
    [
      0,
      {
        armROut: 135,
        armRFwd: 15,
        armRBend: 10,
        smile: 1.5,
        cheek: 0.5,
        neckTilt: -5,
        neckNod: -6,
      },
    ],
    [0.45, { armROut: 120, armRFwd: 40, armRBend: 8, smile: 1.5 }],
    [0.9, {}],
  ],
  cheer: [
    [
      0,
      {
        armLOut: (u) => 120 + 12 * Math.sin(u * 20),
        armROut: (u) => 120 - 12 * Math.sin(u * 20),
        armLFwd: 18,
        armRFwd: 18,
        ...happy,
        neckNod: -7,
        bodyPitch: -2,
      },
    ],
    [1.1, {}],
  ],
  salute: [
    [0, { armRFwd: 85, armROut: 38, armRBend: 120, smile: 1.1, lidClose: 0.1, neckNod: -3 }],
    [0.8, { armRFwd: 85, armROut: 38, armRBend: 120, smile: 1.2 }],
    [1.2, {}],
  ],
  yawn: [
    [
      0,
      {
        lidClose: 0.72,
        mouthWidth: 0.55,
        mouthThick: 2,
        smile: 0,
        bodyPitch: -4,
        armLOut: 70,
        armROut: 70,
        armLFwd: 10,
        armRFwd: 10,
        neckNod: -5,
      },
    ],
    [1.1, { lidClose: 0.5, mouthWidth: 0.55, mouthThick: 1.9, smile: 0, armLOut: 60, armROut: 60 }],
    [1.6, {}],
  ],
  oops: [
    [
      0,
      {
        bodyPitch: -8,
        neckNod: -6,
        lidClose: -0.2,
        mouthWidth: 0.5,
        mouthThick: 1.4,
        smile: 0,
        legLSwing: -6,
        legRSwing: -6,
      },
    ],
    [0.5, { bodyPitch: -5, lidClose: 0.1, smile: 0.8, armLOut: 40, armROut: 40, cheek: 0.6 }],
    [1.1, {}],
  ],
};

export const HOPS: Readonly<Partial<Record<ReactionName, (since: number) => number>>> = {
  juhu: (u) => arc(0.16, 0.34, 0.045)(u) + arc(0.62, 0.26, 0.012)(u),
  hop: arc(0.12, 0.3, 0.035),
  spin: arc(0.1, 0.6, 0.03),
  surprise: arc(0.05, 0.22, 0.014),
  stomp: (u) => arc(0.0, 0.16, 0.004)(u) + arc(0.32, 0.16, 0.004)(u),
  oops: arc(0.0, 0.18, 0.008),
};
