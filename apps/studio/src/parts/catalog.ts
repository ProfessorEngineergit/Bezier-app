/** The standard parts the library offers, with the picture rendered for each (`public/parts`). */

import { fastenerExists, fastenerLengths, METRIC_SIZES } from '@bezier/core';

export type FastenerKind = 'socket-head' | 'hex-bolt' | 'countersunk' | 'hex-nut' | 'washer';

export interface StandardPart {
  kind: FastenerKind;
  name: string;
  standard: string;
  picture: string;
  /** Screws have a length; nuts and washers follow from the size. */
  long: boolean;
}

const part = (kind: FastenerKind, name: string, standard: string, long: boolean): StandardPart => ({
  kind,
  name,
  standard,
  picture: `/parts/${kind}.webp`,
  long,
});

export const SCREWS: readonly StandardPart[] = [
  part('socket-head', 'Socket head screw', 'ISO 4762', true),
  part('hex-bolt', 'Hex bolt', 'ISO 4017', true),
  part('countersunk', 'Countersunk screw', 'ISO 10642', true),
];

export const NUTS_AND_WASHERS: readonly StandardPart[] = [
  part('hex-nut', 'Hex nut', 'ISO 4032', false),
  part('washer', 'Washer', 'ISO 7089', false),
];

/** The sizes this part's standard has. */
export const sizesOf = (part: StandardPart) =>
  METRIC_SIZES.map((size) => size.name).filter((name) => fastenerExists(part.kind, name));

/** A usual length for a size, about three diameters, from those its standard has. */
export function usualLength(part: StandardPart, size: string): number {
  const nominal = METRIC_SIZES.find((entry) => entry.name === size)?.nominal ?? 5;
  const lengths = fastenerLengths(part.kind, size);
  const nearest = (best: number, next: number) =>
    Math.abs(next - nominal * 3) < Math.abs(best - nominal * 3) ? next : best;
  return lengths.reduce(nearest, lengths[0] ?? 0);
}
