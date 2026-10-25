/**
 * Direct modelling: moves faces, edges and corners and lets neighbouring faces follow. Everything
 * becomes rigid motions of whole faces, the input of the kernel's tweak (`tweakFacesWithHistory`,
 * better-occt `facade/src/bezier_tweak.cpp`), which re-intersects the moved surfaces.
 *
 * - A picked face takes the motion as is.
 * - On a turn, faces at a picked edge or corner turn with it; a planar face that would have to
 *   leave its far side is instead ruled between that far side and the turned edge.
 * - On a slide, a planar face at a picked edge or corner tilts about its far side; two picks that
 *   span the face slide it whole. Non-planar faces slide.
 *
 * The kernel refuses moves that leave an invalid solid. A small face in the way (a chamfer) is then
 * removed and the move retried (`tweak-vanishing.ts`); otherwise the reason is reported.
 */
import { Refused } from './occt-support.js';
import {
  compose,
  cross,
  IDENTITY,
  length,
  type Matrix,
  NONE,
  slide,
  tiltOf,
  turnAbout,
  twistOf,
  unit,
} from './tweak-geometry.js';
import { flatMotions, withoutVanishingFace } from './tweak-vanishing.js';
import type { PartMotion, Vec3 } from './types.js';
import type { loadOcct } from './wasm.js';

type RawKernel = Awaited<ReturnType<typeof loadOcct>>;
type Handle = ReturnType<RawKernel['makeBox']>;
type Evolution = ReturnType<RawKernel['cutWithHistory']>;

function motionOf(motion: PartMotion): Matrix {
  const { turn } = motion;
  const turned =
    turn && Math.abs(turn.angle) > NONE && length(turn.axis) > NONE
      ? turnAbout(turn.origin, turn.axis, turn.angle)
      : IDENTITY;
  return compose(slide(motion.by), turned);
}

/** What a face is made of, for telling which picked parts lie on it and how far it reaches. */
interface FaceParts {
  face: Handle;
  edges: Handle[];
  vertices: Handle[];
}

function partsOf(kernel: RawKernel, face: Handle, held: Handle[]): FaceParts {
  const edges = kernel.getSubShapes(face, 'edge');
  const vertices = kernel.getSubShapes(face, 'vertex');
  held.push(...edges, ...vertices);
  return { face, edges, vertices };
}

/** Corners and points along every edge: the extent of a face. Only for faces that tilt. */
function outlineOf(kernel: RawKernel, face: FaceParts): Vec3[] {
  const outline = face.vertices.map((v) => kernel.vertexPosition(v));
  for (const edge of face.edges) {
    const { first, last } = kernel.curveParameters(edge);
    for (let i = 1; i < 8; i++)
      outline.push(kernel.curvePointAtParam(edge, first + ((last - first) * i) / 8));
  }
  return outline;
}

/** Whether two faces meet smoothly along an edge they share: their normals agree there. */
function smoothAlong(kernel: RawKernel, a: FaceParts, b: FaceParts): boolean {
  const shared = a.edges.find((e) => b.edges.some((f) => kernel.isSame(e, f)));
  if (shared === undefined) return false;
  const { first, last } = kernel.curveParameters(shared);
  const at = kernel.curvePointAtParam(shared, (first + last) / 2);
  const normal = (face: Handle) => {
    const { u, v } = kernel.uvFromPoint(face, at);
    return unit(kernel.surfaceNormal(face, u, v));
  };
  return length(cross(normal(a.face), normal(b.face))) < 1e-6;
}

/**
 * Adds curved faces that meet a moved face smoothly (e.g. a fillet on a pulled top), following
 * curved-to-curved only so adjoining planar walls stay put. Otherwise the fillet is left behind and
 * the move refused.
 */
function withSmoothNeighbours(
  kernel: RawKernel,
  parts: readonly FaceParts[],
  moves: ReadonlyMap<number, Matrix>,
): Map<number, Matrix> {
  const out = new Map(moves);
  const queue = [...moves.keys()];
  while (queue.length > 0) {
    const from = queue.shift() as number;
    const motion = out.get(from) as Matrix;
    // A twisted face has no motion a rounding beside it could share.
    if (motion.length !== 12) continue;
    parts.forEach((candidate, i) => {
      if (out.has(i) || kernel.surfaceType(candidate.face) === 'plane') return;
      if (!smoothAlong(kernel, parts[from] as FaceParts, candidate)) return;
      out.set(i, motion);
      queue.push(i);
    });
  }
  return out;
}

/** Points of a picked edge or corner: its ends and, for an edge, points along it. */
function pointsOf(kernel: RawKernel, part: Handle, kind: 'edge' | 'vertex'): Vec3[] {
  if (kind === 'vertex') return [kernel.vertexPosition(part)];
  const { first, last } = kernel.curveParameters(part);
  return Array.from({ length: 9 }, (_, i) =>
    kernel.curvePointAtParam(part, first + ((last - first) * i) / 8),
  );
}

function normalOf(kernel: RawKernel, face: Handle): Vec3 {
  const uv = kernel.uvBounds(face);
  return unit(kernel.surfaceNormal(face, (uv.uMin + uv.uMax) / 2, (uv.vMin + uv.vMax) / 2));
}

/** The words for what the kernel said, and what it said kept as detail. */
function refusal(error: unknown): Refused {
  const said = error instanceof Error ? error.message : String(error);
  if (/no longer meet|could not be found/.test(said))
    return new Refused(
      'The faces beside it would come apart. Try a smaller move, or move them with it.',
      said,
    );
  return new Refused('A face beside it would vanish or turn inside out. Try a smaller move.', said);
}

/**
 * `targets` are faces, edges and corners of `body`. Returns the new solid and which new face each
 * old face became, as the other history-bearing operations do.
 */
export function tweakParts(
  kernel: RawKernel,
  body: Handle,
  targets: readonly Handle[],
  motion: PartMotion,
  hashes: readonly number[],
  bound: number,
): Evolution {
  const held: Handle[] = [];
  try {
    const whole = motionOf(motion);
    const turned = motion.turn !== undefined && Math.abs(motion.turn.angle) > NONE;
    const faces = kernel.getSubShapes(body, 'face');
    held.push(...faces);
    const parts = faces.map((face) => partsOf(kernel, face, held));
    const moves = new Map<number, Matrix>();
    // What was picked on each face that is not picked itself, by kind.
    const pickedOn = new Map<number, Vec3[]>();
    for (const target of targets) {
      const kind = kernel.getShapeType(target);
      if (kind === 'face') {
        const at = faces.findIndex((f) => kernel.isSame(f, target));
        if (at >= 0) moves.set(at, whole);
        continue;
      }
      if (kind !== 'edge' && kind !== 'vertex') continue;
      const points = pointsOf(kernel, target, kind);
      parts.forEach((p, i) => {
        const on = (kind === 'edge' ? p.edges : p.vertices).some((s) => kernel.isSame(s, target));
        if (on) pickedOn.set(i, [...(pickedOn.get(i) ?? []), ...points]);
      });
    }
    for (const [i, points] of pickedOn) {
      if (moves.has(i)) continue;
      const face = parts[i] as FaceParts;
      if (turned && kernel.surfaceType(face.face) === 'plane') {
        moves.set(i, twistOf(outlineOf(kernel, face), normalOf(kernel, face.face), points, whole));
        continue;
      }
      if (turned || kernel.surfaceType(face.face) !== 'plane') {
        moves.set(i, whole);
        continue;
      }
      const tilt = tiltOf(outlineOf(kernel, face), normalOf(kernel, face.face), points, motion.by);
      if (tilt !== null) moves.set(i, tilt);
    }
    if (moves.size === 0)
      throw new Refused(
        'This move changes nothing: it runs along what you picked. Move it across the faces beside it.',
      );
    const run = (chosen: ReadonlyMap<number, Matrix>) => {
      const at = [...chosen.keys()];
      return kernel.tweakFacesWithHistory(
        body,
        at.map((i) => faces[i] as Handle),
        flatMotions(at.map((i) => chosen.get(i) as Matrix)),
        at.map(() => 0),
        [...hashes],
        bound,
      );
    };
    const smooth = withSmoothNeighbours(kernel, parts, moves);
    try {
      return run(smooth);
    } catch (error) {
      // A carried fillet can leave a wall it cannot reach; retry the move as picked, with the
      // fillet cut to fit.
      if (smooth.size !== moves.size) {
        try {
          return run(moves);
        } catch {
          // Tried below with a face taken away.
        }
      }
      // A chamfer or fillet the move runs past would have to vanish; retry without it.
      const at = [...moves.keys()];
      const without = withoutVanishingFace(
        kernel,
        body,
        faces,
        {
          faces: at.map((i) => faces[i] as Handle),
          motions: at.map((i) => moves.get(i) as Matrix),
        },
        hashes,
        bound,
      );
      if (without !== null) return without;
      throw refusal(error);
    }
  } finally {
    for (const shape of held) kernel.release(shape);
  }
}

/**
 * Push faces out along their own outward normal by `distance` (inward when negative): a hole gets
 * narrower, a boss wider, a wall thicker. The faces around them follow as for a move.
 */
export function offsetFaces(
  kernel: RawKernel,
  body: Handle,
  faces: readonly Handle[],
  distance: number,
  hashes: readonly number[],
  bound: number,
): Evolution {
  try {
    return kernel.tweakFacesWithHistory(
      body,
      [...faces],
      faces.flatMap(() => [...IDENTITY]),
      faces.map(() => distance),
      [...hashes],
      bound,
    );
  } catch (error) {
    throw refusal(error);
  }
}
