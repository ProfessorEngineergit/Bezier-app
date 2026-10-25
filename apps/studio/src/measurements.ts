/** Inspection readings are world-space snapshots, never geometry identities. */
export type MeasurePoint = Readonly<{ x: number; y: number; z: number }>;
export interface MeasurementResult {
  distance: number;
  dx: number;
  dy: number;
  dz: number;
}

export function measurement(points: readonly MeasurePoint[]): MeasurementResult | null {
  const a = points[0];
  const b = points[1];
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return { distance: Math.hypot(dx, dy, dz), dx, dy, dz };
}

/** The angle at the second point between the lines to the first and third, in degrees. */
export function angleAt(points: readonly MeasurePoint[]): number | null {
  const [a, b, c] = points;
  if (!a || !b || !c) return null;
  const u = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const v = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const lu = Math.hypot(u.x, u.y, u.z);
  const lv = Math.hypot(v.x, v.y, v.z);
  if (lu < 1e-12 || lv < 1e-12) return null;
  const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / (lu * lv);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}
