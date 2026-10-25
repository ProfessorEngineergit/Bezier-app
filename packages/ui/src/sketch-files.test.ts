import { drawnGeometry, sketchRegions } from '@bezier/core';
import type { Sketch } from '@bezier/solver';
import { describe, expect, it } from 'vitest';
import { dxfToSketch, sketchToDxf, sketchToSvg, svgToSketch } from './sketch-files.js';
import { emptySketch } from './sketch-tools.js';

/** A 20 × 10 rectangle with a hole, an arc, and a construction centreline. */
const drawing: Sketch = {
  primitives: [
    { kind: 'point', id: 'a', x: 0, y: 0 },
    { kind: 'point', id: 'b', x: 20, y: 0 },
    { kind: 'point', id: 'c', x: 20, y: 10 },
    { kind: 'point', id: 'd', x: 0, y: 10 },
    { kind: 'line', id: 'l1', start: 'a', end: 'b' },
    { kind: 'line', id: 'l2', start: 'b', end: 'c' },
    { kind: 'line', id: 'l3', start: 'c', end: 'd' },
    { kind: 'line', id: 'l4', start: 'd', end: 'a' },
    { kind: 'point', id: 'h', x: 5, y: 5 },
    { kind: 'circle', id: 'k', center: 'h', radius: 2 },
    { kind: 'point', id: 'm', x: 10, y: 0 },
    { kind: 'point', id: 'n', x: 10, y: 10 },
    { kind: 'line', id: 'cl', start: 'm', end: 'n', construction: true },
    { kind: 'point', id: 'ac', x: 40, y: 0 },
    { kind: 'point', id: 'as', x: 45, y: 0 },
    { kind: 'point', id: 'ae', x: 40, y: 5 },
    { kind: 'arc', id: 'arc', center: 'ac', start: 'as', end: 'ae' },
  ],
  constraints: [],
};

const kinds = (sketch: Sketch) =>
  sketch.primitives
    .filter((p) => p.kind !== 'point')
    .map((p) => `${p.kind}${'construction' in p && p.construction ? '*' : ''}`)
    .sort();

describe('DXF', () => {
  it('round-trips lines, circles, arcs and construction', () => {
    const dxf = sketchToDxf(drawing);
    expect(dxf).toContain('$INSUNITS');
    const back = dxfToSketch(dxf, emptySketch());
    if (!back.ok) throw new Error(back.message);
    expect(kinds(back.sketch)).toEqual(kinds(drawing));
    // Ends shared: the same closed areas as before (the holed rectangle, and the hole).
    expect(sketchRegions(back.sketch, drawnGeometry(back.sketch))).toHaveLength(
      sketchRegions(drawing, drawnGeometry(drawing)).length,
    );
    const arc = back.sketch.primitives.find((p) => p.kind === 'arc');
    const at = (id: string) => back.sketch.primitives.find((p) => p.id === id);
    if (arc?.kind !== 'arc') throw new Error('no arc');
    expect(at(arc.start)).toMatchObject({ x: expect.closeTo(45), y: expect.closeTo(0) });
    expect(at(arc.end)).toMatchObject({ x: expect.closeTo(40), y: expect.closeTo(5) });
  });

  it('reads closed polylines and says when there is nothing to read', () => {
    const poly = [
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'LWPOLYLINE',
      '8',
      '0',
      '90',
      '3',
      '70',
      '1',
      '10',
      '0',
      '20',
      '0',
      '10',
      '10',
      '20',
      '0',
      '10',
      '0',
      '20',
      '10',
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ].join('\n');
    const read = dxfToSketch(poly, emptySketch());
    expect(read.ok && read.sketch.primitives.filter((p) => p.kind === 'line')).toHaveLength(3);
    expect(dxfToSketch('0\nEOF\n', emptySketch()).ok).toBe(false);
  });
});

describe('SVG', () => {
  it('fits the page to the curves, not to their circles (audit F-008)', () => {
    const ellipse: Sketch = {
      primitives: [
        { kind: 'point', id: 'c', x: 0, y: 0 },
        { kind: 'point', id: 'v', x: 20, y: 0 },
        { kind: 'ellipse', id: 'e', center: 'c', vertex: 'v', minor: 10 },
      ],
      constraints: [],
    };
    // 40 × 20 and a millimetre all round, not 42 × 42.
    const svg = sketchToSvg(ellipse);
    expect(svg).toContain('width="42mm" height="22mm"');
    // A quarter arc reaches only as far as its own quarter of the circle.
    expect(sketchToSvg(drawing)).toContain('height="12mm"');
  });

  it('round-trips the drawing, y flipped and back', () => {
    const svg = sketchToSvg(drawing);
    expect(svg).toContain('width="47mm"');
    expect(svg).toContain('stroke-dasharray');
    const back = svgToSketch(svg, emptySketch());
    if (!back.ok) throw new Error(back.message);
    expect(back.sketch.primitives.filter((p) => p.kind === 'circle')).toHaveLength(1);
    // The rectangle comes back closed, where it was.
    expect(sketchRegions(back.sketch, drawnGeometry(back.sketch)).length).toBeGreaterThanOrEqual(1);
    const ys = back.sketch.primitives
      .filter((p) => p.kind === 'point')
      .map((p) => (p.kind === 'point' ? p.y : 0));
    expect(Math.max(...ys)).toBeCloseTo(10);
  });

  it('reads paths with curves and arcs as joined short lines', () => {
    const svg =
      '<svg><path d="M 0 0 h 10 A 5 5 0 0 1 10 10 C 5 12 2 12 0 10 z"/><rect x="20" y="0" width="5" height="5"/></svg>';
    const read = svgToSketch(svg, emptySketch());
    if (!read.ok) throw new Error(read.message);
    expect(sketchRegions(read.sketch, drawnGeometry(read.sketch))).toHaveLength(2);
    expect(svgToSketch('<svg></svg>', emptySketch()).ok).toBe(false);
  });
});
