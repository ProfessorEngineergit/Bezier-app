/**
 * ISO metric sizes for holes and threads. Pitch: ISO 261 (coarse). Clearance: ISO 273 (medium).
 * Counterbore head: ISO 4762 (socket head cap screw), head diameter and height, plus a millimetre
 * of room around the head. Countersink head: ISO 10642, theoretical head diameter.
 */

export interface MetricSize {
  name: string;
  nominal: number;
  pitch: number;
  clearance: number;
  capHead: number;
  capHeight: number;
  sunkHead: number;
}

export const METRIC_SIZES = [
  { name: 'M2', nominal: 2, pitch: 0.4, clearance: 2.4, capHead: 3.8, capHeight: 2, sunkHead: 4.4 },
  {
    name: 'M2.5',
    nominal: 2.5,
    pitch: 0.45,
    clearance: 2.9,
    capHead: 4.5,
    capHeight: 2.5,
    sunkHead: 5.5,
  },
  {
    name: 'M3',
    nominal: 3,
    pitch: 0.5,
    clearance: 3.4,
    capHead: 5.5,
    capHeight: 3,
    sunkHead: 6.72,
  },
  { name: 'M4', nominal: 4, pitch: 0.7, clearance: 4.5, capHead: 7, capHeight: 4, sunkHead: 8.96 },
  {
    name: 'M5',
    nominal: 5,
    pitch: 0.8,
    clearance: 5.5,
    capHead: 8.5,
    capHeight: 5,
    sunkHead: 11.2,
  },
  { name: 'M6', nominal: 6, pitch: 1, clearance: 6.6, capHead: 10, capHeight: 6, sunkHead: 13.44 },
  { name: 'M8', nominal: 8, pitch: 1.25, clearance: 9, capHead: 13, capHeight: 8, sunkHead: 17.92 },
  {
    name: 'M10',
    nominal: 10,
    pitch: 1.5,
    clearance: 11,
    capHead: 16,
    capHeight: 10,
    sunkHead: 22.4,
  },
  {
    name: 'M12',
    nominal: 12,
    pitch: 1.75,
    clearance: 13.5,
    capHead: 18,
    capHeight: 12,
    sunkHead: 26.88,
  },
] as const satisfies readonly MetricSize[];

export type MetricName = (typeof METRIC_SIZES)[number]['name'];

export const metricSize = (name: string): MetricSize | undefined =>
  METRIC_SIZES.find((size) => size.name === name);

/** The drill for a thread to be cut: the nominal size less a pitch. */
export const tapDrill = (size: MetricSize): number =>
  Number((size.nominal - size.pitch).toFixed(2));

/** A thread's pitch for a round wall: the ISO size nearest to it, outside or in a hole. */
export function pitchFor(diameter: number, inward: boolean): number {
  const nominal = (size: MetricSize) => (inward ? tapDrill(size) : size.nominal);
  const [nearest] = [...METRIC_SIZES].sort(
    (a, b) => Math.abs(nominal(a) - diameter) - Math.abs(nominal(b) - diameter),
  );
  return nearest?.pitch ?? 1;
}
