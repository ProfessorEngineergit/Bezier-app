/**
 * What the timelapse shows for a step: the tool that made it, opened in the rail as it was when
 * someone chose it. A sketch goes through its tools one shape at a time.
 */
import type { FeatureRecord } from '@bezier/core';
import type { Sketch, SketchPrimitive } from '@bezier/solver';
import { CATEGORIES, type CategoryId, type Command, stepCommand } from '@bezier/ui';

/** What the rail shows. `shapes` is how many of the sketch's shapes are drawn so far. */
export interface TimelapseCue {
  category: CategoryId | null;
  tool: string | null;
  sketch?: { id: string; shapes: number };
}

const holds = (command: Command, id: string) =>
  command.id === id || (command.variants?.some((variant) => variant.id === id) ?? false);

/** The rail category and command for a step type. */
export function stepCue(type: string): TimelapseCue {
  // Round and bevel are one command.
  const id = type === 'chamfer' ? 'fillet' : stepCommand(type);
  for (const [category, { commands }] of Object.entries(CATEGORIES)) {
    if (category === 'sketch') continue;
    const command = commands.find((candidate) => holds(candidate, id));
    if (command !== undefined) return { category: category as CategoryId, tool: command.id };
  }
  return { category: null, tool: null };
}

const TOOLS: Readonly<Partial<Record<SketchPrimitive['kind'], string>>> = {
  arc: 'arc',
  circle: 'circle',
  ellipse: 'circle',
  spline: 'spline',
};

type Line = Extract<SketchPrimitive, { kind: 'line' }>;

/** Lines from `from` on that follow end to start and come back to the first: a drawn outline. */
function loopFrom(shapes: readonly SketchPrimitive[], from: number): number {
  const first = shapes[from];
  if (first?.kind !== 'line') return 0;
  let last: Line = first;
  for (let at = from + 1; at < shapes.length; at += 1) {
    const next = shapes[at];
    if (next?.kind !== 'line' || next.start !== last.end) return 0;
    last = next;
    if (last.end === first.start) return at - from + 1;
  }
  return 0;
}

/** Each tool used, in drawing order, and how many shapes are down once it has been used. */
export function sketchTools(sketch: Sketch): readonly { tool: string; shapes: number }[] {
  const shapes = sketch.primitives.filter((shape) => shape.kind !== 'point');
  const tools: { tool: string; shapes: number }[] = [];
  let at = 0;
  while (at < shapes.length) {
    const loop = loopFrom(shapes, at);
    const shape = shapes[at];
    if (loop >= 3) {
      at += loop;
      tools.push({ tool: loop === 4 ? 'rectangle' : 'polygon', shapes: at });
    } else {
      at += 1;
      tools.push({
        tool: shape === undefined ? 'line' : (TOOLS[shape.kind] ?? 'line'),
        shapes: at,
      });
    }
  }
  return tools;
}

/** The sketch as far as it has been drawn: its first shapes and their points, no rules yet. */
export function sketchSoFar(sketch: Sketch, shapes: number): Sketch {
  const drawn = sketch.primitives.filter((shape) => shape.kind !== 'point').slice(0, shapes);
  const used = new Set<unknown>(drawn.flatMap((shape) => Object.values(shape).flat()));
  const kept = new Set<SketchPrimitive>(drawn);
  return {
    ...sketch,
    constraints: [],
    primitives: sketch.primitives.filter(
      (shape) =>
        (shape.kind === 'point' && used.has(shape.id)) ||
        (shape.kind !== 'point' && kept.has(shape)),
    ),
  };
}

/** A sketch feature's drawing, or null for any other step. */
export function sketchOf(feature: FeatureRecord): Sketch | null {
  const sketch = feature.params.sketch;
  return feature.type === 'sketch' && typeof sketch === 'object' && sketch !== null
    ? (sketch as Sketch)
    : null;
}

/** What the viewport shows of the sketches while a cue is drawing one of them. */
export function cuedSketches<T extends { id: string; sketch: Sketch }>(
  shown: readonly T[],
  cue: TimelapseCue | null,
): readonly T[] {
  const drawing = cue?.sketch;
  if (drawing === undefined) return shown;
  return shown.map((item) =>
    item.id === drawing.id ? { ...item, sketch: sketchSoFar(item.sketch, drawing.shapes) } : item,
  );
}
