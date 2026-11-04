import type { Sketch, SketchPrimitive } from '@bezier/solver';
import { describe, expect, it } from 'vitest';
import { sketchSoFar, sketchTools, stepCue } from './timelapse-script.js';

const point = (id: string): SketchPrimitive => ({ kind: 'point', id, x: 0, y: 0 });
const line = (id: string, start: string, end: string): SketchPrimitive => ({
  kind: 'line',
  id,
  start,
  end,
});
const sketch = (primitives: SketchPrimitive[]): Sketch => ({ primitives, constraints: [] });

const rectangle = ['a', 'b', 'c', 'd']
  .map(point)
  .concat([line('l0', 'a', 'b'), line('l1', 'b', 'c'), line('l2', 'c', 'd'), line('l3', 'd', 'a')]);

describe('the tools of a sketch', () => {
  it('reads four lines round a loop as one rectangle', () => {
    expect(sketchTools(sketch(rectangle))).toEqual([{ tool: 'rectangle', shapes: 4 }]);
  });

  it('keeps open lines as lines, one at a time', () => {
    const open = sketch([
      point('a'),
      point('b'),
      point('c'),
      line('l0', 'a', 'b'),
      line('l1', 'b', 'c'),
    ]);
    expect(sketchTools(open).map((step) => step.tool)).toEqual(['line', 'line']);
  });

  it('goes through a rectangle and then a circle, in order', () => {
    const circle: SketchPrimitive = { kind: 'circle', id: 'c0', center: 'a', radius: 2 };
    expect(sketchTools(sketch([...rectangle, circle]))).toEqual([
      { tool: 'rectangle', shapes: 4 },
      { tool: 'circle', shapes: 5 },
    ]);
  });

  it('draws only what is done so far, with the points it stands on', () => {
    const part = sketchSoFar(sketch(rectangle), 1);
    expect(part.primitives.map((shape) => shape.id)).toEqual(['a', 'b', 'l0']);
    expect(part.constraints).toEqual([]);
  });
});

describe('the tool of a step', () => {
  it('finds the flyout a command lives in', () => {
    expect(stepCue('extrude')).toEqual({ category: 'tools', tool: 'extrude' });
    expect(stepCue('mirror').category).toBe('transform');
  });

  it('shows nothing for a step no command makes', () => {
    expect(stepCue('reference-image')).toEqual({ category: null, tool: null });
  });
});
