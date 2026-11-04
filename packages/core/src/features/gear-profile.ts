/**
 * The outline of a spur gear: involute flanks on the standard basic rack (ISO 53), so two gears of
 * the same module and pressure angle mesh at the distance m(z1 + z2) / 2. The profile closes on the
 * root circle; flanks below the base circle run straight in, and no undercut is cut for few teeth.
 */

import type { ProfilePoint, ProfileSegment } from '@bezier/kernel';

/** Tooth height above the pitch circle and below it, in modules. */
const ADDENDUM = 1;
const DEDENDUM = 1.25;
/** Below this the root circle falls inside what a tooth this size can stand on. */
export const MIN_TEETH = 8;

const involute = (angle: number) => Math.tan(angle) - angle;

function polar(radius: number, angle: number): ProfilePoint {
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

export interface GearCircles {
  pitch: number;
  base: number;
  tip: number;
  root: number;
}

export function gearCircles(teeth: number, module: number, pressureAngle: number): GearCircles {
  const pitch = (module * teeth) / 2;
  return {
    pitch,
    base: pitch * Math.cos(pressureAngle),
    tip: pitch + ADDENDUM * module,
    root: pitch - DEDENDUM * module,
  };
}

/**
 * How far either flank of a tooth stands from the tooth's centre line at `radius`, as an angle. At
 * the pitch circle a tooth is half the circular pitch wide.
 */
export function flankAngle(teeth: number, pressureAngle: number, base: number, radius: number) {
  const atBase = Math.PI / (2 * teeth) + involute(pressureAngle);
  return atBase - involute(Math.acos(Math.min(1, base / radius)));
}

/**
 * The involute from `from` to `to` as Bézier pieces. Stepped by roll angle, not radius: the curve
 * leaves the base circle radially, where its slope against the radius is infinite.
 */
function flankPoles(
  teeth: number,
  pressureAngle: number,
  base: number,
  from: number,
  to: number,
  side: 1 | -1,
  centre: number,
): ProfilePoint[] {
  const pieces = 2;
  const atBase = flankAngle(teeth, pressureAngle, base, base);
  const roll = (radius: number) => Math.sqrt(Math.max(0, (radius / base) ** 2 - 1));
  const at = (t: number) =>
    polar(base * Math.hypot(1, t), centre + side * (atBase - (t - Math.atan(t))));
  const first = roll(from);
  const step = (roll(to) - first) / pieces;
  const slope = (t: number) => {
    const small = step * 1e-3;
    const a = at(t - small);
    const b = at(t + small);
    return { x: (b.x - a.x) / (2 * small), y: (b.y - a.y) / (2 * small) };
  };
  const poles: ProfilePoint[] = [at(first)];
  for (let piece = 0; piece < pieces; piece++) {
    const start = first + step * piece;
    const end = start + step;
    const a = at(start);
    const b = at(end);
    const da = slope(start);
    const db = slope(end);
    poles.push(
      { x: a.x + (da.x * step) / 3, y: a.y + (da.y * step) / 3 },
      { x: b.x - (db.x * step) / 3, y: b.y - (db.y * step) / 3 },
      b,
    );
  }
  return poles;
}

const reversed = <T>(list: readonly T[]) => [...list].reverse();

/** One closed loop round the gear, counter-clockwise, a tooth centred on +X. */
export function gearOutline(
  teeth: number,
  module: number,
  pressureAngle: number,
): readonly ProfileSegment[] {
  const { base, tip, root } = gearCircles(teeth, module, pressureAngle);
  const start = Math.max(base, root);
  const segments: ProfileSegment[] = [];
  const pitchAngle = (2 * Math.PI) / teeth;
  const atStart = flankAngle(teeth, pressureAngle, base, start);
  const atTip = flankAngle(teeth, pressureAngle, base, tip);
  for (let tooth = 0; tooth < teeth; tooth++) {
    const centre = tooth * pitchAngle;
    const rising = flankPoles(teeth, pressureAngle, base, start, tip, -1, centre);
    const falling = reversed(flankPoles(teeth, pressureAngle, base, start, tip, 1, centre));
    const footIn = polar(root, centre - atStart);
    const footOut = polar(root, centre + atStart);
    const riseFrom = rising[0] ?? footIn;
    const fallTo = falling[falling.length - 1] ?? footOut;
    if (root < start) segments.push({ kind: 'line', start: footIn, end: riseFrom });
    segments.push({ kind: 'spline', poles: rising });
    segments.push({
      kind: 'arc',
      start: polar(tip, centre - atTip),
      mid: polar(tip, centre),
      end: polar(tip, centre + atTip),
    });
    segments.push({ kind: 'spline', poles: falling });
    if (root < start) segments.push({ kind: 'line', start: fallTo, end: footOut });
    // The root, on to the foot of the next tooth.
    const next = centre + pitchAngle;
    segments.push({
      kind: 'arc',
      start: root < start ? footOut : fallTo,
      mid: polar(root, centre + pitchAngle / 2),
      end: polar(root, next - atStart),
    });
  }
  return segments;
}
