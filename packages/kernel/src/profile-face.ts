/**
 * Build a face from a profile: the first loop is the outline, every further loop a hole.
 * Exact line, arc, circle, spline and ellipse segments are consumed in the sketch plane and
 * placed into 3D here, since the kernel is the only layer that should know how a plane becomes
 * world coordinates.
 */
import type { Profile } from './kernel.js';
import { cross, toWorld } from './occt-support.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type RawHandle = ReturnType<RawKernel['makeBox']>;

/**
 * A chain of cubic Bézier pieces as one B-spline edge: knots at every joint, each three deep, which
 * is exactly the pieces and nothing smoothed between them.
 */
function bezierChainEdge(
  occt: RawKernel,
  poles: readonly { x: number; y: number; z: number }[],
): RawHandle {
  const pieces = Math.round((poles.length - 1) / 3);
  if (pieces < 1 || poles.length !== pieces * 3 + 1)
    throw new Error('A spline needs 3n + 1 poles.');
  const knots = Array.from({ length: pieces + 1 }, (_, k) => k);
  const multiplicities = knots.map((_, k) => (k === 0 || k === pieces ? 4 : 3));
  return occt.makeBSplineEdge(
    poles.flatMap((p) => [p.x, p.y, p.z]),
    poles.map(() => 1),
    knots,
    multiplicities,
    3,
    false,
  );
}

/**
 * An ellipse, or a part of one, exactly: a circular arc is a chain of rational quadratic pieces (up
 * to a quarter turn each, the middle pole where the end tangents meet, weighted by the cosine of
 * half the piece's angle), and the affine map that takes the unit circle to the ellipse carries it
 * there. An affine map leaves a rational curve's weights alone, so this is the ellipse itself and
 * not a fit. `makeEllipseEdge` would also need its long axis turned into place.
 */
function ellipseEdge(
  occt: RawKernel,
  segment: Extract<Profile['loops'][number][number], { kind: 'ellipse' }>,
  world: (point: { x: number; y: number }) => { x: number; y: number; z: number },
): RawHandle {
  const a = Math.hypot(segment.major.x, segment.major.y);
  const u = { x: segment.major.x / a, y: segment.major.y / a };
  const v = { x: -u.y, y: u.x };
  const from = segment.from ?? 0;
  const sweep = segment.sweep ?? 2 * Math.PI;
  const pieces = Math.max(1, Math.ceil(sweep / (Math.PI / 2) - 1e-9));
  const step = sweep / pieces;
  const place = (p: number, q: number) => {
    const at = world({
      x: segment.center.x + u.x * a * p + v.x * segment.minor * q,
      y: segment.center.y + u.y * a * p + v.y * segment.minor * q,
    });
    return [at.x, at.y, at.z];
  };
  const poles: number[] = [];
  const weights: number[] = [];
  const middle = Math.cos(step / 2);
  for (let k = 0; k < pieces; k += 1) {
    const start = from + step * k;
    if (k === 0) {
      poles.push(...place(Math.cos(start), Math.sin(start)));
      weights.push(1);
    }
    const half = start + step / 2;
    poles.push(...place(Math.cos(half) / middle, Math.sin(half) / middle));
    weights.push(middle);
    poles.push(...place(Math.cos(start + step), Math.sin(start + step)));
    weights.push(1);
  }
  const knots = Array.from({ length: pieces + 1 }, (_, k) => k / pieces);
  const multiplicities = knots.map((_, k) => (k === 0 || k === pieces ? 3 : 2));
  return occt.makeBSplineEdge(poles, weights, knots, multiplicities, 2, false);
}

/** One loop of a profile as a wire, in world space: closed for an outline, open for a path. */
export function wireOfLoop(
  occt: RawKernel,
  profile: Pick<Profile, 'origin' | 'normal' | 'xDirection'>,
  loop: Profile['loops'][number],
): RawHandle {
  const yDirection = cross(profile.normal, profile.xDirection);
  const world = (point: { x: number; y: number }) =>
    toWorld(point, profile.origin, profile.xDirection, yDirection);
  return occt.makeWire(
    loop.map((segment) => {
      if (segment.kind === 'circle') {
        return occt.makeCircleEdge(world(segment.center), profile.normal, segment.radius);
      }
      if (segment.kind === 'arc') {
        return occt.makeArcEdge(world(segment.start), world(segment.mid), world(segment.end));
      }
      if (segment.kind === 'spline') return bezierChainEdge(occt, segment.poles.map(world));
      if (segment.kind === 'ellipse') return ellipseEdge(occt, segment, world);
      return occt.makeLineEdge(world(segment.start), world(segment.end));
    }),
  );
}

export function faceFromProfile(occt: RawKernel, profile: Profile): RawHandle {
  const [outer, ...holes] = profile.loops;
  if (outer === undefined || outer.length === 0) {
    throw new Error('a profile needs an outer loop');
  }
  const face = occt.makeFace(wireOfLoop(occt, profile, outer));
  const inner = holes.filter((loop) => loop.length > 0);
  if (inner.length === 0) return face;
  return occt.addHolesInFace(
    face,
    inner.map((loop) => wireOfLoop(occt, profile, loop)),
  );
}
