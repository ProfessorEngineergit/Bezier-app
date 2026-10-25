/**
 * Deterministic benchmark documents, parameterized by feature count so scaling with history length
 * can be measured.
 *
 * Every pocket must cut a different region. Pockets sharing point ids end up at the same position,
 * so later cuts remove almost nothing and results look about six times better than real geometry.
 */

import type { CadDocument, FeatureRecord } from '@bezier/core';
import { createEmptyDocument } from '@bezier/core';
import type { ConstraintSolver, Point2, Sketch, SketchId, SolveResult } from '@bezier/solver';

/** Position and size of a sketch rectangle. */
interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

const placements = new Map<SketchId, Point2>();

/** Returns a closed rectangle. `prefix` keeps point ids unique across sketches. */
export function rectangleSketch(prefix: string, at: Placement): Sketch {
  const corners = [0, 1, 2, 3].map((i) => `${prefix}-p${i}`);
  const [x, y, w, h] = [at.x, at.y, at.width, at.height];

  // Positions returned by `fixedSolver`.
  const coordinates: Point2[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  corners.forEach((id, i) => {
    const point = coordinates[i];
    if (point !== undefined) placements.set(id, point);
  });

  return {
    primitives: [
      ...corners.map((id) => ({ kind: 'point' as const, id, x: 0, y: 0 })),
      ...corners.map((id, i) => ({
        kind: 'line' as const,
        id: `${prefix}-l${i}`,
        start: id,
        end: corners[(i + 1) % corners.length] as SketchId,
      })),
    ],
    constraints: [],
  };
}

/**
 * Returns a solver that yields each sketch's recorded placement, so the benchmarks measure the
 * rebuild pipeline without constraint solving.
 */
export function fixedSolver(): ConstraintSolver {
  return {
    solve(sketch: Sketch): SolveResult {
      const positions = new Map<SketchId, Point2>();
      for (const primitive of sketch.primitives) {
        if (primitive.kind !== 'point') continue;
        positions.set(primitive.id, placements.get(primitive.id) ?? { x: 0, y: 0 });
      }
      return {
        status: 'solved',
        positions,
        radii: new Map(),
        dof: 0,
        conflicting: [],
        redundant: [],
      };
    },
    dispose: () => {},
  };
}

function document(name: string, features: FeatureRecord[]): CadDocument {
  const base = createEmptyDocument(name, () => new Date('2026-08-05T12:00:00.000Z'));
  return { ...base, features };
}

/** The base block of every corpus document. */
function baseFeatures(width: number, height: number): FeatureRecord[] {
  return [
    {
      id: 'sketch-1',
      type: 'sketch',
      name: 'Sketch',
      params: { plane: 'XY', sketch: rectangleSketch('base', { x: 0, y: 0, width, height }) },
    },
    {
      id: 'extrude-1',
      type: 'extrude',
      name: 'Extrude',
      params: { sketch: 'sketch-1', distance: 20, direction: 'forward', operation: 'new' },
    },
  ];
}

/** Returns a block with `count` pockets in a grid, so every cut removes fresh material. */
export function blockWithPockets(count: number): CadDocument {
  const columns = Math.ceil(Math.sqrt(count));
  const spacing = 14;
  const blockSize = (columns + 1) * spacing;

  const features = baseFeatures(blockSize, blockSize);

  for (let i = 0; i < count; i++) {
    const column = i % columns;
    const row = Math.floor(i / columns);
    const at = {
      x: spacing * 0.5 + column * spacing,
      y: spacing * 0.5 + row * spacing,
      width: 8,
      height: 8,
    };

    features.push({
      id: `pocket-sketch-${i}`,
      type: 'sketch',
      name: `Pocket sketch ${i}`,
      params: { plane: 'XY', sketch: rectangleSketch(`pocket-${i}`, at) },
    });
    features.push({
      id: `pocket-${i}`,
      type: 'extrude',
      name: `Pocket ${i}`,
      params: {
        // Varying depth so no two pockets are identical operations a cache could share.
        sketch: `pocket-sketch-${i}`,
        distance: 5 + (i % 7),
        direction: 'forward',
        operation: 'cut',
      },
    });
  }

  return document(`Block with ${count} pockets`, features);
}

/** The smallest document that exercises the whole pipeline. */
export function simplePart(): CadDocument {
  return document('Simple part', baseFeatures(40, 60));
}

export const CORPUS = {
  simple: simplePart(),
  small: blockWithPockets(3),
  medium: blockWithPockets(10),
  large: blockWithPockets(20),
} as const;

/**
 * Returns the document with one pocket's depth changed. Editing the last pocket replays little;
 * editing the first invalidates everything after it.
 */
export function editPocket(document: CadDocument, index: number): CadDocument {
  return {
    ...document,
    features: document.features.map((feature) =>
      feature.id === `pocket-${index}`
        ? { ...feature, params: { ...feature.params, distance: 9 + Math.random() } }
        : feature,
    ),
  };
}
