import { describe, expect, it } from 'vitest';
import { projectOutline } from './sketch-project.js';
import { emptySketch } from './sketch-tools.js';

const arc = (cx: number, cy: number, r: number, from: number, to: number, n = 12) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / n;
    return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
  });

describe('projecting edges', () => {
  it('reads a square outline as four joined lines', () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const edges = corners.map((p, i) => [p, corners[(i + 1) % 4] ?? p]);
    const sketch = projectOutline(emptySketch(), edges);
    expect(sketch.primitives.filter((p) => p.kind === 'line')).toHaveLength(4);
    expect(sketch.primitives.filter((p) => p.kind === 'point')).toHaveLength(4);
  });

  it('reads a closed round edge as a circle', () => {
    const sketch = projectOutline(emptySketch(), [arc(5, 5, 3, 0, 2 * Math.PI, 36)]);
    const circle = sketch.primitives.find((p) => p.kind === 'circle');
    expect(circle?.kind === 'circle' && circle.radius).toBeCloseTo(3);
  });

  it('reads an open round edge as an arc stored counter-clockwise', () => {
    // Sampled clockwise, from angle π/2 down to 0.
    const sketch = projectOutline(emptySketch(), [arc(0, 0, 4, Math.PI / 2, 0)]);
    const found = sketch.primitives.find((p) => p.kind === 'arc');
    if (found?.kind !== 'arc') throw new Error('no arc');
    const at = (id: string) => sketch.primitives.find((p) => p.id === id);
    expect(at(found.start)).toMatchObject({ x: expect.closeTo(4), y: expect.closeTo(0) });
    expect(at(found.end)).toMatchObject({ x: expect.closeTo(0), y: expect.closeTo(4) });
    expect(at(found.center)).toMatchObject({ x: expect.closeTo(0), y: expect.closeTo(0) });
  });
});
