/** Projective coordinates keep a drag in millimetres at every zoom and view angle. */
export type Axis = 'x' | 'y' | 'z';
export type Point = Record<Axis, number>;
export type Basis = { x: number; y: number; depth: number };
export const AXES = ['x', 'y', 'z'] as const;
export const PLANES = [
  { key: 'xy', a: 'x', b: 'y', normal: 'z' },
  { key: 'yz', a: 'y', b: 'z', normal: 'x' },
  { key: 'zx', a: 'z', b: 'x', normal: 'y' },
] as const;

export function axisDistance(a: Basis, x: number, y: number): number {
  const squared = a.x * a.x + a.y * a.y;
  if (squared < 1e-8) return 0;
  const q = (x * a.x + y * a.y) / squared;
  const denominator = 1 - q * a.depth;
  return denominator > 0.05 ? q / denominator : 0;
}

export function planeDistance(a: Basis, b: Basis, x: number, y: number) {
  const ax = a.x - x * a.depth;
  const ay = a.y - y * a.depth;
  const bx = b.x - x * b.depth;
  const by = b.y - y * b.depth;
  const det = ax * by - ay * bx;
  if (Math.abs(det) < 1e-8) return { a: 0, b: 0 };
  const u = (x * by - y * bx) / det;
  const v = (y * ax - x * ay) / det;
  return 1 + u * a.depth + v * b.depth > 0.05 ? { a: u, b: v } : { a: 0, b: 0 };
}

export function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * The rotation snap step for a pointer speed in degrees per second: fine when placing slowly,
 * coarse round angles when swinging fast. Shift forces the coarse step.
 */
export function rotationStep(degreesPerSecond: number, shift: boolean): number {
  if (shift || degreesPerSecond >= 120) return 15;
  if (degreesPerSecond >= 25) return 5;
  return 1;
}

/**
 * Smoothed pointer speed. Raw events are too jittery to pick a step from, and a step flickering
 * between 1° and 15° would make the value jump.
 */
export function smoothSpeed(previous: number, degrees: number, seconds: number): number {
  const now = Math.abs(degrees) / Math.max(seconds, 0.008);
  return previous * 0.6 + now * 0.4;
}
