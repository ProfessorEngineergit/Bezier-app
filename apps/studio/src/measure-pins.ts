/**
 * Pinned measurements, stored per project on this device. A pin is two points in space, not a
 * geometry reference, so when the model changes it is kept and marked possibly stale.
 */
import type { DisplayGeometry } from '@bezier/renderer';
import type { MeasurePoint } from './measurements.js';

export interface Pin {
  id: number;
  points: readonly MeasurePoint[];
  /** Pinned on a model that has changed since. */
  stale?: boolean;
}

/** Enough to detect a model change: triangle count and first and last positions. */
export function modelSignature(geometry: DisplayGeometry | null): string {
  if (geometry === null) return '';
  const p = geometry.mesh.positions;
  return `${p.length}:${p[0] ?? 0}:${p[p.length - 1] ?? 0}`;
}

const keyOf = (project: string) => `bezier.measure-pins.${project}`;

export function loadPins(project: string, signature: string): Pin[] {
  try {
    const raw = localStorage.getItem(keyOf(project));
    if (raw === null) return [];
    const saved = JSON.parse(raw) as { signature: string; pins: Pin[] };
    return saved.pins.map((pin) => ({
      ...pin,
      stale: pin.stale === true || saved.signature !== signature,
    }));
  } catch {
    return [];
  }
}

export function savePins(project: string, signature: string, pins: readonly Pin[]): void {
  try {
    if (pins.length === 0) localStorage.removeItem(keyOf(project));
    else localStorage.setItem(keyOf(project), JSON.stringify({ signature, pins }));
  } catch {
    // Not persisted: the pin is lost at the next open.
  }
}
