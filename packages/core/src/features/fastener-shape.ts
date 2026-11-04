/**
 * Standard fasteners as numbers and outlines. Every number is from the standard's own tables:
 * ISO 4762 (socket head), ISO 4017 (hex head, thread to the head), ISO 10642 (countersunk socket),
 * ISO 4032 (hex nut), ISO 7089 (washer). Heads and shanks come from `iso-metric.ts`.
 *
 * Where a standard gives a range the nominal or the maximum is drawn, so a part fits what it is
 * made to fit. Threads are plain at the nominal diameter unless asked for, as in most assemblies.
 */

import type { ProfilePoint } from '@bezier/kernel';
import { type MetricName, metricSize } from './iso-metric.js';

export const FASTENERS = ['socket-head', 'hex-bolt', 'countersunk', 'hex-nut', 'washer'] as const;
export type Fastener = (typeof FASTENERS)[number];

interface Sizes {
  /** ISO 4017, ISO 4032: across flats. */
  flats: number;
  /** ISO 4017: head height, nominal. */
  boltHead: number;
  /** ISO 4017, grade A: the washer face under the head, its diameter and thickness. */
  face: readonly [number, number];
  /** ISO 4032: height, maximum. */
  nut: number;
  /** ISO 4762: hex key, depth of the socket, reference thread length. */
  key: number;
  keyDepth: number;
  thread: number;
  /** ISO 4762: the longest screw threaded to the head. */
  threadedTo: number;
  /** ISO 7089: bore, outside and thickness. */
  washer: readonly [number, number, number];
  /** ISO 4762 and ISO 4017: the commercial lengths, first and last. */
  capLengths: readonly [number, number];
  boltLengths: readonly [number, number];
}

const SIZES: Record<MetricName, Sizes> = {
  // biome-ignore format: a table
  M2: { flats: 4, boltHead: 1.4, face: [3.07, 0.25], nut: 1.6, key: 1.5, keyDepth: 1, thread: 16, threadedTo: 16, washer: [2.2, 5, 0.3], capLengths: [3, 20], boltLengths: [4, 20] },
  // biome-ignore format: a table
  'M2.5': { flats: 5, boltHead: 1.7, face: [4.07, 0.25], nut: 2, key: 2, keyDepth: 1.1, thread: 17, threadedTo: 20, washer: [2.7, 6, 0.5], capLengths: [4, 25], boltLengths: [5, 25] },
  // biome-ignore format: a table
  M3: { flats: 5.5, boltHead: 2, face: [4.57, 0.4], nut: 2.4, key: 2.5, keyDepth: 1.3, thread: 18, threadedTo: 25, washer: [3.2, 7, 0.5], capLengths: [5, 30], boltLengths: [6, 30] },
  // biome-ignore format: a table
  M4: { flats: 7, boltHead: 2.8, face: [5.88, 0.4], nut: 3.2, key: 3, keyDepth: 2, thread: 20, threadedTo: 25, washer: [4.3, 9, 0.8], capLengths: [6, 40], boltLengths: [8, 40] },
  // biome-ignore format: a table
  M5: { flats: 8, boltHead: 3.5, face: [6.88, 0.5], nut: 4.7, key: 4, keyDepth: 2.5, thread: 22, threadedTo: 25, washer: [5.3, 10, 1], capLengths: [8, 50], boltLengths: [10, 50] },
  // biome-ignore format: a table
  M6: { flats: 10, boltHead: 4, face: [8.88, 0.5], nut: 5.2, key: 5, keyDepth: 3, thread: 24, threadedTo: 30, washer: [6.4, 12, 1.6], capLengths: [10, 60], boltLengths: [12, 60] },
  // biome-ignore format: a table
  M8: { flats: 13, boltHead: 5.3, face: [11.63, 0.6], nut: 6.8, key: 6, keyDepth: 4, thread: 28, threadedTo: 35, washer: [8.4, 16, 1.6], capLengths: [12, 80], boltLengths: [16, 80] },
  // biome-ignore format: a table
  M10: { flats: 16, boltHead: 6.4, face: [14.63, 0.6], nut: 8.4, key: 8, keyDepth: 5, thread: 32, threadedTo: 40, washer: [10.5, 20, 2], capLengths: [16, 100], boltLengths: [20, 100] },
  // biome-ignore format: a table
  M12: { flats: 18, boltHead: 7.5, face: [16.63, 0.6], nut: 10.8, key: 10, keyDepth: 6, thread: 36, threadedTo: 50, washer: [13, 24, 2.5], capLengths: [20, 120], boltLengths: [25, 120] },
};

export const fastenerSizes = (name: string): Sizes | undefined => SIZES[name as MetricName];

/** ISO 10642, which starts at M3: hex key, socket depth, thread, threaded to, and lengths. */
const SUNK: Partial<
  Record<
    MetricName,
    {
      key: number;
      keyDepth: number;
      thread: number;
      threadedTo: number;
      lengths: readonly [number, number];
    }
  >
> = {
  M3: { key: 2, keyDepth: 1.1, thread: 18, threadedTo: 25, lengths: [8, 30] },
  M4: { key: 2.5, keyDepth: 1.5, thread: 20, threadedTo: 25, lengths: [8, 40] },
  M5: { key: 3, keyDepth: 1.9, thread: 22, threadedTo: 30, lengths: [8, 50] },
  M6: { key: 4, keyDepth: 2.2, thread: 24, threadedTo: 35, lengths: [8, 60] },
  M8: { key: 5, keyDepth: 3, thread: 28, threadedTo: 45, lengths: [10, 80] },
  M10: { key: 6, keyDepth: 3.6, thread: 32, threadedTo: 50, lengths: [12, 100] },
  M12: { key: 8, keyDepth: 4.3, thread: 36, threadedTo: 60, lengths: [20, 100] },
};

export const sunkSizes = (name: string) => SUNK[name as MetricName];

/** ISO 888's series of nominal lengths, as far as these sizes reach. */
const NOMINAL_LENGTHS = [
  3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120,
];

/** Whether this standard has this size at all. */
export function fastenerExists(kind: Fastener, name: string): boolean {
  if (fastenerSizes(name) === undefined) return false;
  return kind !== 'countersunk' || sunkSizes(name) !== undefined;
}

/** The commercial lengths of a screw; none for a nut or a washer. */
export function fastenerLengths(kind: Fastener, name: string): readonly number[] {
  const range =
    kind === 'countersunk'
      ? sunkSizes(name)?.lengths
      : kind === 'socket-head'
        ? fastenerSizes(name)?.capLengths
        : kind === 'hex-bolt'
          ? fastenerSizes(name)?.boltLengths
          : undefined;
  if (range === undefined) return [];
  return NOMINAL_LENGTHS.filter((length) => length >= range[0] && length <= range[1]);
}

/** How far a modelled thread runs from the tip: to the head, or its reference length. */
export function threadLength(kind: Fastener, name: string, length: number): number {
  if (kind === 'hex-bolt') return length;
  const sizes = kind === 'countersunk' ? sunkSizes(name) : fastenerSizes(name);
  if (sizes === undefined) return length;
  return length <= sizes.threadedTo ? length : sizes.thread;
}

/** The six corners of a hexagon of these flats, about the origin. */
export function hexagon(flats: number): ProfilePoint[] {
  const corner = flats / Math.sqrt(3);
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (index * Math.PI) / 3;
    return { x: corner * Math.cos(angle), y: corner * Math.sin(angle) };
  });
}

/**
 * What a screw turns about its axis to: x out from the axis, y along it, the seat of the head at 0
 * with the shank below and the head above. A countersunk head sits below 0: its 90° cone runs out
 * at the theoretical head diameter, flush with the face, as the standard gauges it.
 */
export function screwSection(kind: Fastener, name: string, length: number): ProfilePoint[] {
  const size = metricSize(name);
  if (size === undefined) return [];
  const shank = size.nominal / 2;
  const tip = Math.min(size.pitch, shank * 0.5);
  const lower: ProfilePoint[] = [
    { x: 0, y: -length },
    { x: shank - tip, y: -length },
    { x: shank, y: -length + tip },
  ];
  if (kind === 'countersunk') {
    const head = size.sunkHead / 2;
    return [...lower, { x: shank, y: -(head - shank) }, { x: head, y: 0 }, { x: 0, y: 0 }];
  }
  if (kind === 'hex-bolt') {
    const [face, thick] = fastenerSizes(name)?.face ?? [size.nominal, 0];
    return [
      ...lower,
      { x: shank, y: 0 },
      { x: face / 2, y: 0 },
      { x: face / 2, y: thick + 0.01 },
      { x: 0, y: thick + 0.01 },
    ];
  }
  const head = size.capHead / 2;
  const edge = size.capHeight * 0.08;
  return [
    ...lower,
    { x: shank, y: 0 },
    { x: head, y: 0 },
    { x: head, y: size.capHeight - edge },
    { x: head - edge, y: size.capHeight },
    { x: 0, y: size.capHeight },
  ];
}

/**
 * The turned body a hex head or a nut is cut from, so its corners are taken off at 30°: on top
 * only for a head, on both sides for a nut. The chamfer starts a little inside the flats, on the
 * bearing circle of ISO 4032 (0.95 of them).
 */
export function hexChamfer(flats: number, height: number, bothSides: boolean): ProfilePoint[] {
  const corner = flats / Math.sqrt(3);
  const flat = (flats * 0.95) / 2;
  const drop = (corner - flat) * Math.tan(Math.PI / 6);
  const lower: ProfilePoint[] = bothSides
    ? [
        { x: flat, y: 0 },
        { x: corner, y: drop },
      ]
    : [{ x: corner, y: 0 }];
  return [
    { x: 0, y: 0 },
    ...lower,
    { x: corner, y: height - drop },
    { x: flat, y: height },
    { x: 0, y: height },
  ];
}

/** The ring of a washer, seated on 0. */
export function washerSection(name: string): ProfilePoint[] {
  const sizes = fastenerSizes(name);
  if (sizes === undefined) return [];
  const [bore, outside, thick] = sizes.washer;
  return [
    { x: bore / 2, y: 0 },
    { x: outside / 2, y: 0 },
    { x: outside / 2, y: thick },
    { x: bore / 2, y: thick },
  ];
}
